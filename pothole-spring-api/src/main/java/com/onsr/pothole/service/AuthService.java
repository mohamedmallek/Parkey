package com.onsr.pothole.service;

import com.onsr.pothole.dto.AuthResponse;
import com.onsr.pothole.dto.LoginRequest;
import com.onsr.pothole.dto.UserResponse;
import com.onsr.pothole.model.User;
import com.onsr.pothole.repository.UserRepository;
import com.onsr.pothole.security.JwtService;
import com.onsr.pothole.security.UserPrincipal;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;

@Service
public class AuthService {

    private static final int RESET_TOKEN_HOURS = 1;

    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;

    public AuthService(
            AuthenticationManager authenticationManager,
            JwtService jwtService,
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            EmailService emailService) {
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.emailService = emailService;
    }

    public AuthResponse login(LoginRequest request) {
        String email = request.getEmail() == null ? "" : request.getEmail().trim().toLowerCase();
        String password = request.getPassword() == null ? "" : request.getPassword().trim();
        Authentication auth = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(email, password));
        UserPrincipal principal = (UserPrincipal) auth.getPrincipal();
        User user = principal.getUser();
        String token = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole());
        return new AuthResponse(token, UserResponse.from(user));
    }

    public UserResponse me(UserPrincipal principal) {
        return userRepository.findById(principal.getUserId())
                .map(UserResponse::from)
                .orElseGet(() -> UserResponse.from(principal.getUser()));
    }

    public UserResponse meById(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Utilisateur introuvable"));
        return UserResponse.from(user);
    }

    public void forgotPassword(String rawEmail) {
        if (!StringUtils.hasText(rawEmail)) {
            return;
        }
        userRepository.findByEmailIgnoreCase(rawEmail.trim().toLowerCase())
                .filter(User::isEnabled)
                .ifPresent(user -> {
                    String token = newResetToken();
                    user.setResetTokenHash(sha256Hex(token));
                    user.setResetTokenExpiresAt(Instant.now().plus(RESET_TOKEN_HOURS, ChronoUnit.HOURS));
                    user.setUpdatedAt(Instant.now());
                    userRepository.save(user);
                    emailService.sendPasswordReset(user.getEmail(), user.getFullName(), token);
                });
    }

    public void resetPassword(String token, String password, String confirmPassword) {
        if (!StringUtils.hasText(token)) {
            throw new IllegalArgumentException("Ce lien n’est plus valable. Demandez un nouveau mail.");
        }
        if (!StringUtils.hasText(password) || password.length() < 8) {
            throw new IllegalArgumentException("Le mot de passe doit contenir au moins 8 caractères.");
        }
        if (!password.equals(confirmPassword)) {
            throw new IllegalArgumentException("Les deux mots de passe ne correspondent pas.");
        }

        User user = userRepository.findByResetTokenHash(sha256Hex(token.trim()))
                .orElseThrow(() -> new IllegalArgumentException("Ce lien n’est plus valable. Demandez un nouveau mail."));
        if (user.getResetTokenExpiresAt() == null || user.getResetTokenExpiresAt().isBefore(Instant.now())) {
            user.setResetTokenHash(null);
            user.setResetTokenExpiresAt(null);
            userRepository.save(user);
            throw new IllegalArgumentException("Ce lien a expiré. Demandez un nouveau mail.");
        }

        user.setPasswordHash(passwordEncoder.encode(password));
        user.setResetTokenHash(null);
        user.setResetTokenExpiresAt(null);
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
    }

    public void changePasswordWithCurrent(String rawEmail, String currentPassword, String password, String confirmPassword) {
        if (!StringUtils.hasText(password) || password.length() < 8) {
            throw new IllegalArgumentException("Le mot de passe doit contenir au moins 8 caractères.");
        }
        if (!password.equals(confirmPassword)) {
            throw new IllegalArgumentException("Les deux mots de passe ne correspondent pas.");
        }
        User user = userRepository.findByEmailIgnoreCase(rawEmail == null ? "" : rawEmail.trim().toLowerCase())
                .filter(User::isEnabled)
                .orElseThrow(() -> new IllegalArgumentException("Email ou mot de passe actuel incorrect."));
        if (!passwordEncoder.matches(currentPassword == null ? "" : currentPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("Email ou mot de passe actuel incorrect.");
        }
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setResetTokenHash(null);
        user.setResetTokenExpiresAt(null);
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
    }

    private static String newResetToken() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
