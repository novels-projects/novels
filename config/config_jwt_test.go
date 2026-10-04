package config

import (
	"testing"

	"github.com/spf13/viper"
)

func TestLoadConfigReadsJWTSecretsFromEnvironment(t *testing.T) {
	viper.Reset()
	t.Cleanup(viper.Reset)
	t.Setenv("JWT_SECRET", "test-access-secret")
	t.Setenv("JWT_REFRESH_SECRET", "test-refresh-secret")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig returned an error: %v", err)
	}
	if cfg.JWTSecret != "test-access-secret" || cfg.JWTRefreshSecret != "test-refresh-secret" {
		t.Fatal("LoadConfig did not read both JWT secrets from the environment")
	}
}

func TestLoadConfigRequiresBothJWTSecrets(t *testing.T) {
	t.Cleanup(viper.Reset)
	cases := []struct {
		name               string
		accessSecret       string
		refreshTokenSecret string
	}{
		{name: "missing access secret", refreshTokenSecret: "test-refresh-secret"},
		{name: "missing refresh secret", accessSecret: "test-access-secret"},
	}

	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			viper.Reset()
			t.Setenv("JWT_SECRET", testCase.accessSecret)
			t.Setenv("JWT_REFRESH_SECRET", testCase.refreshTokenSecret)

			if _, err := LoadConfig(); err == nil {
				t.Fatal("LoadConfig should reject missing JWT secrets")
			}
		})
	}
}
