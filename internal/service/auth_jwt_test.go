package service_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/spf13/viper"
	"golang.org/x/crypto/bcrypt"

	"novel-be/config"
	"novel-be/internal/dto"
	"novel-be/internal/handlers"
	"novel-be/internal/middleware"
	"novel-be/internal/models"
	"novel-be/internal/repository"
	"novel-be/internal/service"
)

type jwtTestAuthRepository struct {
	repository.AuthRepository
	user *models.User
}

func (r *jwtTestAuthRepository) GetByEmail(context.Context, string) (*models.User, error) {
	return r.user, nil
}

func (r *jwtTestAuthRepository) GetByID(context.Context, uint) (*models.User, error) {
	return r.user, nil
}

func newJWTTestAuth(t *testing.T) (config.Config, *service.AuthService, *models.User) {
	t.Helper()
	viper.Reset()
	t.Cleanup(viper.Reset)
	t.Setenv("JWT_SECRET", "test-access-secret")
	t.Setenv("JWT_REFRESH_SECRET", "test-refresh-secret")

	cfg, err := config.LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig returned an error: %v", err)
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte("reader-password-123"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("failed to hash test password: %v", err)
	}
	user := &models.User{
		ID:           42,
		Username:     "test-reader",
		Email:        "reader@example.test",
		PasswordHash: string(passwordHash),
		Role:         "reader",
		Status:       "active",
	}
	repo := &jwtTestAuthRepository{user: user}
	return cfg, service.NewAuthService(repo, cfg.JWTSecret, cfg.JWTRefreshSecret), user
}

func TestLoginAccessTokenVerifiesWithConfiguredMiddlewareSecret(t *testing.T) {
	cfg, authService, user := newJWTTestAuth(t)
	middleware.SetJWTSecret(cfg.JWTSecret)

	response, err := authService.Login(context.Background(), dto.LoginRequest{
		Email:    user.Email,
		Password: "reader-password-123",
	})
	if err != nil {
		t.Fatalf("Login returned an error: %v", err)
	}

	var userID uint
	var role string
	handler := middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, _ = middleware.GetUserIDFromContext(r.Context())
		role, _ = middleware.GetRoleFromContext(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodGet, "/protected", nil)
	request.Header.Set("Authorization", "Bearer "+response.Token)
	result := httptest.NewRecorder()
	handler.ServeHTTP(result, request)

	if result.Code != http.StatusNoContent || userID != user.ID || role != user.Role {
		t.Fatal("middleware did not verify the login token and preserve its identity claims")
	}
}

func TestRefreshEndpointVerifiesRefreshTokenAndIssuesUsableTokens(t *testing.T) {
	cfg, authService, user := newJWTTestAuth(t)
	middleware.SetJWTSecret(cfg.JWTSecret)

	loginResponse, err := authService.Login(context.Background(), dto.LoginRequest{
		Email:    user.Email,
		Password: "reader-password-123",
	})
	if err != nil {
		t.Fatalf("Login returned an error: %v", err)
	}

	body, err := json.Marshal(dto.RefreshRequest{RefreshToken: loginResponse.RefreshToken})
	if err != nil {
		t.Fatalf("failed to encode refresh request: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/refresh", bytes.NewReader(body))
	result := httptest.NewRecorder()
	handlers.NewAuthHandler(authService, nil, nil).Refresh(result, request)
	if result.Code != http.StatusOK {
		t.Fatalf("refresh endpoint returned status %d", result.Code)
	}

	var refreshed dto.AuthResponse
	if err := json.Unmarshal(result.Body.Bytes(), &refreshed); err != nil {
		t.Fatalf("failed to decode refresh response: %v", err)
	}
	if refreshed.Token == "" || refreshed.RefreshToken == "" {
		t.Fatal("refresh endpoint did not return both tokens")
	}
	body, err = json.Marshal(dto.RefreshRequest{RefreshToken: refreshed.RefreshToken})
	if err != nil {
		t.Fatalf("failed to encode second refresh request: %v", err)
	}
	request = httptest.NewRequest(http.MethodPost, "/api/refresh", bytes.NewReader(body))
	result = httptest.NewRecorder()
	handlers.NewAuthHandler(authService, nil, nil).Refresh(result, request)
	if result.Code != http.StatusOK {
		t.Fatal("refresh endpoint did not accept the newly issued refresh token")
	}

	request = httptest.NewRequest(http.MethodGet, "/protected", nil)
	var refreshedAgain dto.AuthResponse
	if err := json.Unmarshal(result.Body.Bytes(), &refreshedAgain); err != nil {
		t.Fatalf("failed to decode second refresh response: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+refreshedAgain.Token)
	result = httptest.NewRecorder()
	middleware.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(result, request)
	if result.Code != http.StatusNoContent {
		t.Fatal("middleware did not verify the access token issued by refresh")
	}
}

func TestJWTVerificationRejectsNonHS256Algorithms(t *testing.T) {
	cfg, authService, _ := newJWTTestAuth(t)
	middleware.SetJWTSecret(cfg.JWTSecret)
	token := jwt.NewWithClaims(jwt.SigningMethodHS384, jwt.MapClaims{
		"user_id": 42,
		"role":    "reader",
		"exp":     time.Now().Add(time.Minute).Unix(),
	})
	accessToken, err := token.SignedString([]byte(cfg.JWTSecret))
	if err != nil {
		t.Fatalf("failed to sign test token: %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, "/protected", nil)
	request.Header.Set("Authorization", "Bearer "+accessToken)
	result := httptest.NewRecorder()
	middleware.RequireAuth(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("handler should not run for a non-HS256 token")
	})).ServeHTTP(result, request)
	if result.Code != http.StatusUnauthorized {
		t.Fatalf("middleware accepted non-HS256 token with status %d", result.Code)
	}

	var hasUserID bool
	optionalHandler := middleware.OptionalAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, hasUserID = middleware.GetUserIDFromContext(r.Context())
		w.WriteHeader(http.StatusNoContent)
	}))
	request = httptest.NewRequest(http.MethodGet, "/optional", nil)
	request.Header.Set("Authorization", "Bearer "+accessToken)
	result = httptest.NewRecorder()
	optionalHandler.ServeHTTP(result, request)
	if result.Code != http.StatusNoContent || hasUserID {
		t.Fatal("optional middleware accepted identity claims from a non-HS256 token")
	}

	refreshToken, err := token.SignedString([]byte(cfg.JWTRefreshSecret))
	if err != nil {
		t.Fatalf("failed to sign test refresh token: %v", err)
	}
	if _, err := authService.RefreshToken(context.Background(), dto.RefreshRequest{RefreshToken: refreshToken}); err == nil {
		t.Fatal("refresh flow should reject a non-HS256 token")
	}
}
