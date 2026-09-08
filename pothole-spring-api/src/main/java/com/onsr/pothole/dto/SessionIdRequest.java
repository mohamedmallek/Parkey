package com.onsr.pothole.dto;

import jakarta.validation.constraints.NotBlank;

/** Corps envoyé par le front pour le heartbeat et la déconnexion : identifie la session à mettre à jour. */
public class SessionIdRequest {

    @NotBlank
    private String sessionId;

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }
}
