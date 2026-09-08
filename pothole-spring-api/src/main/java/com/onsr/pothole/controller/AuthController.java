package com.onsr.pothole.controller;

import com.onsr.pothole.dto.AuthResponse;
import com.onsr.pothole.dto.ChangePasswordRequest;
import com.onsr.pothole.dto.ForgotPasswordRequest;
import com.onsr.pothole.dto.LoginRequest;
import com.onsr.pothole.dto.ResetPasswordRequest;
import com.onsr.pothole.dto.SessionIdRequest;
import com.onsr.pothole.dto.UserResponse;
import com.onsr.pothole.security.UserPrincipal;
import com.onsr.pothole.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(@AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(authService.me(principal));
    }

    @PostMapping("/heartbeat")
    public ResponseEntity<Void> heartbeat(
            @Valid @RequestBody SessionIdRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        authService.heartbeat(principal.getUserId(), request.getSessionId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @Valid @RequestBody SessionIdRequest request,
            @AuthenticationPrincipal UserPrincipal principal) {
        authService.logout(principal.getUserId(), request.getSessionId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, String>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        authService.forgotPassword(request.getEmail());
        return ResponseEntity.ok(Map.of(
                "message", "Si un compte existe pour cette adresse, un e-mail vient d’être envoyé."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, String>> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request.getToken(), request.getPassword(), request.getConfirmPassword());
        return ResponseEntity.ok(Map.of("message", "Mot de passe mis à jour. Vous pouvez vous connecter."));
    }

    @PostMapping("/change-password")
    public ResponseEntity<Map<String, String>> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        authService.changePasswordWithCurrent(
                request.getEmail(),
                request.getCurrentPassword(),
                request.getPassword(),
                request.getConfirmPassword());
        return ResponseEntity.ok(Map.of("message", "Mot de passe mis à jour. Connectez-vous avec le nouveau."));
    }
}
