package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"novel-be/internal/dto"

	"github.com/golang-jwt/jwt/v5"
)

// สร้างประเภทข้อมูลพิเศษสำหรับใช้เป็น Key ใน Context เพื่อความปลอดภัยไม่ให้ชนกับอันอื่น
type contextKey string

const (
	UserIDKey contextKey = "user_id"
	RoleKey   contextKey = "role"
)

var jwtSecret []byte

func SetJWTSecret(secret string) {
	jwtSecret = []byte(secret)
}

// UnauthorizedRecorder คือ signature ของฟังก์ชันที่ใช้บันทึก audit log เวลามีการเข้าถึงโดยไม่มีสิทธิ์
// ใช้ function type แทนการ import "novel-be/internal/service" ตรงๆ เพราะ service package (audit_service.go)
// import middleware package อยู่แล้ว — ถ้า middleware import service กลับไปด้วยจะเกิด import cycle ทันที
// วิธีนี้ทำให้ middleware ไม่ต้องรู้จัก service.AuditService เลย แค่รู้จัก signature ฟังก์ชันนี้พอ
type UnauthorizedRecorder func(r *http.Request, reason string, attemptedRole string, userID uint, hasUserID bool)

var unauthorizedRecorder UnauthorizedRecorder

// SetUnauthorizedRecorder ให้ main.go เรียกตอน startup ครั้งเดียว เพื่อผูก audit service เข้ากับ middleware
//
//	เช่น middleware.SetUnauthorizedRecorder(func(r *http.Request, reason, role string, uid uint, hasUID bool) {
//	    var actor *uint
//	    if hasUID { actor = &uid }
//	    _ = auditService.RecordWithActor(r.Context(), actor, role, service.AuditEvent{
//	        Action: "UNAUTHORIZED_ACCESS", TargetType: "route", Status: "FAILURE",
//	        Metadata: map[string]interface{}{"path": r.URL.Path, "reason": reason},
//	    })
//	})
func SetUnauthorizedRecorder(fn UnauthorizedRecorder) {
	unauthorizedRecorder = fn
}

// recordUnauthorized เรียก recorder แบบ non-blocking (goroutine) กัน audit write ช้าไปดึงเวลา response
// ใส่ recover กันไม่ให้ panic ใน audit logging ทำให้ request หลักพังไปด้วย
func recordUnauthorized(r *http.Request, reason string, attemptedRole string) {
	if unauthorizedRecorder == nil {
		return
	}
	userID, hasUserID := GetUserIDFromContext(r.Context())
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("audit log (unauthorized) recorder panic: %v", rec)
			}
		}()
		unauthorizedRecorder(r, reason, attemptedRole, userID, hasUserID)
	}()
}

func writeAuthError(w http.ResponseWriter, statusCode int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(dto.ErrorResponse{Error: dto.ErrorDetail{Code: code, Message: message}})
}

// =========================================================================================
// [อาจารย์ถาม: "ระบบตรวจสอบการเข้าสู่ระบบ (Authentication) ทำงานอย่างไร / ใช้เทคโนโลยีอะไร?"]
//
// Middleware: RequireAuth
// หน้าที่: บังคับว่าต้องมี JWT Token ที่ถูกต้องเท่านั้นถึงจะผ่านเข้าไปเรียก Handler ได้
//
// ขั้นตอนการทำงาน:
// 1. ดึง Token จาก HTTP Header "Authorization: Bearer <token>" (หรือจาก Query Param ถ้าเป็น SSE)
// 2. ถ้าไม่พบ Token -> ส่ง HTTP 401 Unauthorized กลับไปทันที
// 3. นำ Token มาถอดรหัสและตรวจสอบลายเซ็นดิจิทัล (jwt.Parse)
//   - ตรวจว่า Algorithm ที่ใช้คือ "HS256" (HMAC-SHA256) ป้องกันช่องโหว่ Alg None Attack
//   - ตรวจว่าลายเซ็นตรงกับ jwtSecret ของระบบหรือไม่ และโทเคนหมดอายุหรือยัง (exp claim)
//  4. ถ้าผ่าน -> ดึงข้อมูล Payload (Claims) ได้แก่ "user_id" และ "role" ฝังลงใน r.Context()
//     เพื่อให้ Handler ในชั้นถัดไปสามารถดึง User ID ไปใช้ได้อย่างปลอดภัยโดยไม่ต้อง Verify ซ้ำ
//
// =========================================================================================
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// อนุญาตให้ OPTIONS method วิ่งผ่านได้เสมอ (เพื่อรองรับ CORS Preflight ของ Browser)
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		// 1. สกัดดึง Bearer Token ออกมาจาก Authorization Header
		authHeader := r.Header.Get("Authorization")
		tokenString := extractBearerToken(authHeader)
		if tokenString == "" {
			tokenString = r.URL.Query().Get("token")
		}
		if tokenString == "" {
			recordUnauthorized(r, "missing_token", "")
			writeAuthError(w, http.StatusUnauthorized, "UNAUTHORIZED", "ไม่พบบัตรผ่าน (Token) กรุณาเข้าสู่ระบบค่ะ")
			return
		}

		// 2. ตรวจสอบความถูกต้องของ Token ด้วย Secret Key ของระบบ และบังคับใช้ HS256
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if token.Method != jwt.SigningMethodHS256 {
				return nil, fmt.Errorf("unexpected signing method")
			}
			return jwtSecret, nil
		})

		// ถ้า Token เสียหาย ถูกปลอมแปลง หรือหมดอายุแล้ว
		if err != nil || !token.Valid {
			recordUnauthorized(r, "invalid_or_expired_token", "")
			writeAuthError(w, http.StatusUnauthorized, "UNAUTHORIZED", "บัตรผ่านไม่ถูกต้อง หรือหมดอายุแล้ว")
			return
		}

		// 3. นำ user_id และ role ที่ได้จาก Token ฝังลงใน Request Context
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			ctx := context.WithValue(r.Context(), UserIDKey, claims["user_id"])
			ctx = context.WithValue(ctx, RoleKey, claims["role"])
			r = r.WithContext(ctx)
		}

		// ปลอดภัยแล้ว ส่งคำขอให้ Handler ถัดไปทำงานต่อ
		next.ServeHTTP(w, r)
	})
}

func OptionalAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		authHeader := r.Header.Get("Authorization")
		tokenString := extractBearerToken(authHeader)
		if tokenString == "" {
			tokenString = r.URL.Query().Get("token")
		}

		if tokenString != "" {
			token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
				if token.Method != jwt.SigningMethodHS256 {
					return nil, fmt.Errorf("unexpected signing method")
				}
				return jwtSecret, nil
			})

			if err == nil && token.Valid {
				if claims, ok := token.Claims.(jwt.MapClaims); ok {
					ctx := context.WithValue(r.Context(), UserIDKey, claims["user_id"])
					ctx = context.WithValue(ctx, RoleKey, claims["role"])
					r = r.WithContext(ctx)
				}
			}
		}

		next.ServeHTTP(w, r)
	})
}

// =========================================================================================
// [อาจารย์ถาม: "ตรวจสิทธิ์ Role เช่น แอดมิน หรือ นักเขียน ตรงไหน / ใครห้ามทำอะไรบ้าง?"]
//
// Middleware: RequireRole
// หน้าที่: ตรวจสอบสิทธิ์ (Authorization) ว่าผู้ใช้มี Role ตรงกับที่กำหนดไว้หรือไม่ (เช่น "admin")
//
// ขั้นตอนการทำงาน:
// 1. เรียก RequireAuth ก่อนเสมอเพื่อยืนยันว่าผู้ใช้ล็อกอินจริง
// 2. ดึงค่า Role ออกมาจาก Context
// 3. ถ้าไม่มี Role หรือ Role ไม่ตรงกับ requiredRole -> ส่ง HTTP 403 Forbidden ปฏิเสธทันที
// 4. มีการเรียก recordUnauthorized เพื่อบันทึก Audit Log เฝ้าระวังความปลอดภัย
// =========================================================================================
func RequireRole(requiredRole string, next http.Handler) http.Handler {
	return RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role, ok := GetRoleFromContext(r.Context())
		if !ok || role != requiredRole {
			recordUnauthorized(r, "role_mismatch", role)
			writeAuthError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden: คุณไม่มีสิทธิ์เข้าถึงเส้นทางนี้")
			return
		}
		next.ServeHTTP(w, r)
	}))
}

func RequireNotAdmin(next http.Handler) http.Handler {
	return RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role, ok := GetRoleFromContext(r.Context())
		if ok && role == "admin" {
			writeAuthError(w, http.StatusForbidden, "FORBIDDEN", "Forbidden: Admin ไม่สามารถทำการดำเนินการนี้ได้")
			return
		}
		next.ServeHTTP(w, r)
	}))
}

// RequireAdminReadOnly allows only safe HTTP methods (GET, HEAD, OPTIONS) for admin users.
// For other methods, it returns 403 Forbidden. Non-admin users are unaffected.
func RequireAdminReadOnly(next http.Handler) http.Handler {
	return RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role, ok := GetRoleFromContext(r.Context())
		if ok && role == "admin" {
			method := r.Method
			if method != http.MethodGet && method != http.MethodHead && method != http.MethodOptions {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(dto.ErrorResponse{Error: dto.ErrorDetail{Code: "FORBIDDEN", Message: "Forbidden: Admin has read-only access for this endpoint"}})
				return
			}
		}
		next.ServeHTTP(w, r)
	}))
}

func GetUserIDFromContext(ctx context.Context) (uint, bool) {
	if ctx == nil {
		return 0, false
	}

	switch v := ctx.Value(UserIDKey).(type) {
	case uint:
		return v, true
	case uint64:
		return uint(v), true
	case int:
		return uint(v), true
	case int64:
		return uint(v), true
	case float64:
		return uint(v), true
	case float32:
		return uint(v), true
	default:
		return 0, false
	}
}

func GetRoleFromContext(ctx context.Context) (string, bool) {
	if ctx == nil {
		return "", false
	}

	role, ok := ctx.Value(RoleKey).(string)
	return role, ok
}

func extractBearerToken(header string) string {
	parts := strings.Fields(header)
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
		return strings.TrimSpace(parts[1])
	}
	return strings.TrimSpace(header)
}
