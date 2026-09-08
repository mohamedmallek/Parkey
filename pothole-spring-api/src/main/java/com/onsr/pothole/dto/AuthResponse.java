package com.onsr.pothole.dto;

import com.onsr.pothole.model.Role;

public class AuthResponse {

    private String token;
    private String tokenType = "Bearer";
    private String sessionId;
    private UserResponse user;

    public AuthResponse(String token, String sessionId, UserResponse user) {
        this.token = token;
        this.sessionId = sessionId;
        this.user = user;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public String getTokenType() {
        return tokenType;
    }

    public void setTokenType(String tokenType) {
        this.tokenType = tokenType;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public UserResponse getUser() {
        return user;
    }

    public void setUser(UserResponse user) {
        this.user = user;
    }
}
