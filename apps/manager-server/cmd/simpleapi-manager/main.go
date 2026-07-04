package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/callstore"
	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/config"
	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/httpapi"
	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/security"
	"github.com/GreenTeodoro839/SimpleAPI-Manager/apps/manager-server/internal/store"
)

func main() {
	listen := flag.String("listen", env("HTTP_ADDR", "0.0.0.0:18318"), "HTTP listen address")
	dataDir := flag.String("data", env("DATA_DIR", "./data"), "data directory")
	panelPath := flag.String("panel", env("PANEL_PATH", ""), "built web panel directory")
	adminKey := flag.String("admin-key", env("SIMPLEAPI_MANAGER_ADMIN_KEY", ""), "admin key used only when initializing a new data directory")
	flag.Parse()

	st, generated, err := store.Open(*dataDir, *adminKey, security.RandomToken)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	if generated != "" {
		log.Printf("SimpleAPI Manager admin key generated: %s", generated)
	} else if *adminKey != "" {
		log.Printf("SimpleAPI Manager admin credential initialized from configured admin key")
	} else {
		log.Printf("SimpleAPI Manager admin credential initialized")
	}
	callDB, err := callstore.Open(*dataDir)
	if err != nil {
		log.Fatalf("open call log database: %v", err)
	}
	defer callDB.Close()

	cfg := config.Config{
		HTTPAddr:  *listen,
		DataDir:   *dataDir,
		PanelPath: *panelPath,
	}
	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           httpapi.New(cfg, st, callDB, time.Now().UnixMilli()),
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		log.Printf("simpleapi-manager listening on %s", cfg.HTTPAddr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("http server: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}

func env(name string, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
