package com.onsr.pothole.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

/**
 * Une session de connexion d'un utilisateur (du login jusqu'à la déconnexion
 * explicite ou jusqu'à l'expiration par inactivité). Sert au suivi d'activité
 * consulté par les Superadmin/Admin : qui est en ligne, depuis quand, combien
 * de temps utilisé, historique des connexions passées.
 */
@Document(collection = "user_sessions")
public class UserSession {

    @Id
    private String id;

    @Indexed
    private String userId;

    private Instant loginAt;
    private Instant lastHeartbeatAt;
    private Instant logoutAt;
    /** "logout" (déconnexion explicite) ou "timeout" (session expirée, fermée par le nettoyage automatique). */
    private String endReason;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public Instant getLoginAt() {
        return loginAt;
    }

    public void setLoginAt(Instant loginAt) {
        this.loginAt = loginAt;
    }

    public Instant getLastHeartbeatAt() {
        return lastHeartbeatAt;
    }

    public void setLastHeartbeatAt(Instant lastHeartbeatAt) {
        this.lastHeartbeatAt = lastHeartbeatAt;
    }

    public Instant getLogoutAt() {
        return logoutAt;
    }

    public void setLogoutAt(Instant logoutAt) {
        this.logoutAt = logoutAt;
    }

    public String getEndReason() {
        return endReason;
    }

    public void setEndReason(String endReason) {
        this.endReason = endReason;
    }
}
