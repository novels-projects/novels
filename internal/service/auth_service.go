package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"novel-be/internal/dto"
	"novel-be/internal/models"
	"novel-be/internal/repository"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	accessTokenDuration  = time.Hour * 24
	refreshTokenDuration = time.Hour * 24 * 7
)

type AuthService struct {
	repo               repository.AuthRepository
	jwtSecret          string
	refreshTokenSecret string
}

func NewAuthService(repo repository.AuthRepository, jwtSecret, refreshTokenSecret string) *AuthService {
	return &AuthService{repo: repo, jwtSecret: jwtSecret, refreshTokenSecret: refreshTokenSecret}
}

// Register จัดการการแฮชรหัสผ่านและสั่งบันทึกข้อมูลจริงลงฐานข้อมูล
func (s *AuthService) Register(ctx context.Context, req dto.RegisterRequest, avatarURL string) (*dto.AuthResponse, error) {
	if err := req.Validate(); err != nil {
		return nil, err
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Username = strings.TrimSpace(req.Username)

	if existing, err := s.repo.GetByUsername(ctx, req.Username); err != nil {
		return nil, err
	} else if existing != nil {
		return nil, errors.New("username already in use")
	}

	if existing, err := s.repo.GetByEmail(ctx, req.Email); err != nil {
		return nil, err
	} else if existing != nil {
		return nil, errors.New("email already in use")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	user := &models.User{
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: string(hashedPassword),
		PicProfile:   avatarURL,
		Role:         "reader",
	}

	if err := s.repo.CreateUser(ctx, user); err != nil {
		return nil, err
	}

	accessToken, err := s.createToken(user, accessTokenDuration, s.jwtSecret)
	if err != nil {
		return nil, err
	}

	refreshToken, err := s.createToken(user, refreshTokenDuration, s.refreshTokenSecret)
	if err != nil {
		return nil, err
	}

	return s.buildAuthResponse(user, accessToken, refreshToken), nil
}

// Login ตรวจสอบความถูกต้องของ Email / Password และออกบัตรผ่าน JWT Token
func (s *AuthService) Login(ctx context.Context, req dto.LoginRequest) (*dto.AuthResponse, error) {
	if req.Email == "" || req.Password == "" {
		return nil, errors.New("กรุณากรอกอีเมลและรหัสผ่าน")
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	user, err := s.repo.GetByEmail(ctx, req.Email)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, errors.New("ไม่พบบัญชีผู้ใช้งานนี้ในระบบ")
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password))
	if err != nil {
		return nil, errors.New("รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง")
	}

	if err := validateUserStatusForLogin(user); err != nil {
		return nil, err
	}

	accessToken, err := s.createToken(user, accessTokenDuration, s.jwtSecret)
	if err != nil {
		return nil, err
	}

	refreshToken, err := s.createToken(user, refreshTokenDuration, s.refreshTokenSecret)
	if err != nil {
		return nil, err
	}

	res := s.buildAuthResponse(user, accessToken, refreshToken)
	return res, nil
}

func (s *AuthService) RefreshToken(ctx context.Context, req dto.RefreshRequest) (*dto.AuthResponse, error) {
	if strings.TrimSpace(req.RefreshToken) == "" {
		return nil, errors.New("refresh token is required")
	}

	token, err := jwt.Parse(req.RefreshToken, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, errors.New("invalid refresh token signing method")
		}
		return []byte(s.refreshTokenSecret), nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("refresh token is invalid or expired")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid refresh token claims")
	}

	userIDFloat, ok := claims["user_id"].(float64)
	if !ok {
		return nil, errors.New("invalid refresh token payload")
	}

	userID := uint(userIDFloat)
	user, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, errors.New("user not found")
	}

	accessToken, err := s.createToken(user, accessTokenDuration, s.jwtSecret)
	if err != nil {
		return nil, err
	}

	refreshToken, err := s.createToken(user, refreshTokenDuration, s.refreshTokenSecret)
	if err != nil {
		return nil, err
	}

	return s.buildAuthResponse(user, accessToken, refreshToken), nil
}

func (s *AuthService) createToken(user *models.User, duration time.Duration, secret string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": user.ID,
		"role":    user.Role,
		"exp":     time.Now().Add(duration).Unix(),
	})
	return token.SignedString([]byte(secret))
}

func (s *AuthService) buildAuthResponse(user *models.User, accessToken, refreshToken string) *dto.AuthResponse {
	res := &dto.AuthResponse{
		Token:        accessToken,
		RefreshToken: refreshToken,
	}
	res.User.ID = user.ID
	res.User.Username = user.Username
	res.User.Email = user.Email
	res.User.PicProfile = user.PicProfile
	res.User.Role = user.Role
	return res
}

// GetUserByID ดึงข้อมูลผู้ใช้โดยใช้ ID ของเขา (สำหรับ /api/users endpoint)
func (s *AuthService) GetUserByID(ctx context.Context, userID uint) (*models.User, error) {
	if userID == 0 {
		return nil, errors.New("ไอดีผู้ใช้ไม่ถูกต้อง")
	}

	user, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, errors.New("ไม่พบบัญชีผู้ใช้นี้")
	}

	return user, nil
}

func (s *AuthService) ListUsers(ctx context.Context, role, status, search string, page, limit int) ([]dto.AdminUserListItemDTO, error) {
	return s.repo.ListUsers(ctx, role, status, search, page, limit)
}

func (s *AuthService) GetUserForAdmin(ctx context.Context, userID uint) (*dto.AdminUserDetailDTO, error) {
	return s.repo.GetUserForAdmin(ctx, userID)
}

func (s *AuthService) UpdateUserStatus(ctx context.Context, userID uint, status, reason string, suspendedAt *time.Time, adminID uint) error {
	if userID == adminID {
		return fmt.Errorf("ไม่สามารถดำเนินการกับบัญชีของตัวเองได้")
	}
	if status != "active" && status != "suspended" {
		return fmt.Errorf("status ไม่ถูกต้อง")
	}
	return s.repo.UpdateUserStatus(ctx, userID, status, reason, suspendedAt, adminID)
}

func (s *AuthService) DemoteUserToReader(ctx context.Context, userID uint, adminID uint) error {
	if userID == adminID {
		return fmt.Errorf("ไม่สามารถดำเนินการกับบัญชีของตัวเองได้")
	}
	return s.repo.DemoteUserToReader(ctx, userID, adminID)
}

func (s *AuthService) RestoreUserWriterAccess(ctx context.Context, userID uint, adminID uint) error {
	if userID == adminID {
		return fmt.Errorf("ไม่สามารถดำเนินการกับบัญชีของตัวเองได้")
	}
	return s.repo.RestoreUserWriterAccess(ctx, userID, adminID)
}

func (s *AuthService) DeleteUser(ctx context.Context, userID uint, adminID uint) error {
	if userID == adminID {
		return fmt.Errorf("ไม่สามารถดำเนินการกับบัญชีของตัวเองได้")
	}
	return s.repo.DeleteUser(ctx, userID)
}

func (s *AuthService) HasWriterNovels(ctx context.Context, userID uint) (bool, error) {
	return s.repo.HasWriterNovels(ctx, userID)
}

func (s *AuthService) SuspendOwnAccount(ctx context.Context, userID uint) error {
	if userID == 0 {
		return errors.New("invalid user id")
	}

	user, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("user not found")
	}

	if strings.EqualFold(user.Status, "suspended") {
		return errors.New("account is already suspended")
	}

	return s.repo.SuspendUser(ctx, userID, "Self-deactivated")
}

func (s *AuthService) DeleteOwnAccount(ctx context.Context, userID uint, currentPassword string) error {
	if userID == 0 {
		return errors.New("invalid user id")
	}
	if strings.TrimSpace(currentPassword) == "" {
		return errors.New("current password is required")
	}

	user, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("user not found")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(currentPassword)); err != nil {
		return errors.New("current password is incorrect")
	}

	hasWriterNovels, err := s.HasWriterNovels(ctx, userID)
	if err != nil {
		return err
	}
	if hasWriterNovels {
		return errors.New("ต้องระงับบัญชีแทนการลบ เนื่องจากมีนิยายอยู่ในระบบ")
	}

	return s.repo.DeleteUser(ctx, userID)
}

var validUsernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_]+$`)

func (s *AuthService) UpdateUsername(ctx context.Context, userID uint, username string) error {
	if userID == 0 {
		return errors.New("invalid user id")
	}

	username = strings.TrimSpace(username)
	if username == "" {
		return errors.New("username is required")
	}

	if len(username) < 3 || len(username) > 50 {
		return errors.New("username length must be between 3 and 50 characters")
	}

	if !validUsernameRegex.MatchString(username) {
		return errors.New("username must contain only letters, numbers, and underscores")
	}

	user, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("user not found")
	}

	return s.repo.UpdateUsername(ctx, userID, username)
}

func (s *AuthService) UpdateEmail(ctx context.Context, userID uint, email string) error {
	if userID == 0 {
		return errors.New("invalid user id")
	}

	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return errors.New("email is required")
	}

	user, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("user not found")
	}

	foundUser, err := s.repo.GetByEmail(ctx, email)
	if err != nil {
		return err
	}
	if foundUser != nil && foundUser.ID != userID {
		return errors.New("email already in use")
	}

	return s.repo.UpdateEmail(ctx, userID, email)
}

func (s *AuthService) ChangePassword(ctx context.Context, userID uint, req dto.ChangePasswordRequest) error {
	if userID == 0 {
		return errors.New("invalid user id")
	}

	if err := req.Validate(); err != nil {
		return err
	}

	user, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("user not found")
	}

	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword))
	if err != nil {
		return errors.New("current password is incorrect")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	return s.repo.UpdatePassword(ctx, userID, string(hashedPassword))
}

func (s *AuthService) UpdateProfilePicture(ctx context.Context, userID uint, picProfile string) error {
	if userID == 0 {
		return errors.New("invalid user id")
	}

	picProfile = strings.TrimSpace(picProfile)
	if picProfile == "" {
		return errors.New("profile picture URL is required")
	}

	user, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("user not found")
	}

	return s.repo.UpdateProfilePicture(ctx, userID, picProfile)
}

func validateUserStatusForLogin(user *models.User) error {
	if user == nil {
		return nil
	}
	if strings.EqualFold(user.Status, "suspended") {
		if strings.TrimSpace(user.SuspendedReason) != "" {
			return fmt.Errorf("บัญชีถูกระงับ: %s", user.SuspendedReason)
		}
		return errors.New("บัญชีถูกระงับไว้ชั่วคราว")
	}
	return nil
}
