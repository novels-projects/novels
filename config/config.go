package config

import (
	"fmt"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	AppPort          string
	DatabaseHost     string
	DatabasePort     int
	DatabaseUser     string
	DatabasePassword string
	DatabaseName     string
	DatabaseSSLMode  string
	MinIOEndpoint    string
	MinIOAccessKey   string
	MinIOSecretKey   string
	MinIOUseSSL      bool
	JWTSecret        string
	JWTRefreshSecret string
}

func LoadConfig() (Config, error) {
	// ✅ 1. สั่งให้ Viper ลองหาไฟล์ .env และอ่านค่ามา (ถ้ามี)
	viper.SetConfigFile(".env")
	_ = viper.ReadInConfig() // ใช้ _ รับ Error ไว้ เพราะถ้ารันใน Docker อาจจะไม่มีไฟล์นี้ ก็ปล่อยผ่านได้

	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// ✅ 2. เพิ่ม Default ให้ App Port ป้องกันเซิร์ฟเวอร์บึ้ม
	viper.SetDefault("APP.PORT", "8080")

	viper.SetDefault("POSTGRES.HOST", "localhost")
	viper.SetDefault("POSTGRES.PORT", 5432)
	viper.SetDefault("POSTGRES.USER", "postgres")
	viper.SetDefault("POSTGRES.PASSWORD", "")
	viper.SetDefault("POSTGRES.DBNAME", "novel")
	viper.SetDefault("POSTGRES.SSLMODE", "disable")

	// MinIO defaults
	viper.SetDefault("MINIO.ENDPOINT", "minio:9000") // เปลี่ยนเป็น localhost:9000 ถ้ารันนอก docker
	viper.SetDefault("MINIO.ACCESS_KEY", "minioadmin")
	viper.SetDefault("MINIO.SECRET_KEY", "minioadmin")
	viper.SetDefault("MINIO.USE_SSL", false)

	jwtSecret := strings.TrimSpace(viper.GetString("JWT.SECRET"))
	jwtRefreshSecret := strings.TrimSpace(viper.GetString("JWT.REFRESH_SECRET"))
	if jwtSecret == "" || jwtRefreshSecret == "" {
		return Config{}, fmt.Errorf("JWT_SECRET and JWT_REFRESH_SECRET must be set")
	}

	// Set config values
	config := Config{
		AppPort:          viper.GetString("APP.PORT"),
		DatabaseHost:     viper.GetString("POSTGRES.HOST"),
		DatabasePort:     viper.GetInt("POSTGRES.PORT"),
		DatabaseUser:     viper.GetString("POSTGRES.USER"),
		DatabasePassword: viper.GetString("POSTGRES.PASSWORD"),
		DatabaseName:     viper.GetString("POSTGRES.DBNAME"),
		DatabaseSSLMode:  viper.GetString("POSTGRES.SSLMODE"),
		MinIOEndpoint:    viper.GetString("MINIO.ENDPOINT"),
		MinIOAccessKey:   viper.GetString("MINIO.ACCESS_KEY"),
		MinIOSecretKey:   viper.GetString("MINIO.SECRET_KEY"),
		MinIOUseSSL:      viper.GetBool("MINIO.USE_SSL"),
		JWTSecret:        jwtSecret,
		JWTRefreshSecret: jwtRefreshSecret,
	}

	return config, nil
}

func (c *Config) GetConnectionString() string {
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s TimeZone=UTC",
		c.DatabaseHost,
		c.DatabasePort,
		c.DatabaseUser,
		c.DatabasePassword,
		c.DatabaseName,
		c.DatabaseSSLMode)
}
