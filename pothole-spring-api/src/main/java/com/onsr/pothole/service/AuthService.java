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
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final UserRepository userRepository;

    public AuthService(
            AuthenticationManager authenticationManager,
            JwtService jwtService,
            UserRepository userRepository) {
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
        this.userRepository = userRepository;
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
        return UserResponse.from(principal.getUser());
    }

    public UserResponse meById(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Utilisateur introuvable"));
        return UserResponse.from(user);
    }
}
