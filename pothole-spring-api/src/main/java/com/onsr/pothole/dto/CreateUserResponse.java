package com.onsr.pothole.dto;

import com.onsr.pothole.model.Role;

public class CreateUserResponse {

    private UserResponse user;
    private boolean emailSent;
    private String message;

    public CreateUserResponse(UserResponse user, boolean emailSent, String message) {
        this.user = user;
        this.emailSent = emailSent;
        this.message = message;
    }

    public UserResponse getUser() {
        return user;
    }

    public boolean isEmailSent() {
        return emailSent;
    }

    public String getMessage() {
        return message;
    }
}
