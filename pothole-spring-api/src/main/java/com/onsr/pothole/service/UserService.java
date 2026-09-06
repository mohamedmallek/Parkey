package com.onsr.pothole.service;

import com.onsr.pothole.dto.CreateUserRequest;
import com.onsr.pothole.dto.CreateUserResponse;
import com.onsr.pothole.dto.UpdateUserRequest;
import com.onsr.pothole.dto.UserResponse;
import com.onsr.pothole.model.Role;
import com.onsr.pothole.model.User;
import com.onsr.pothole.repository.UserRepository;
import com.onsr.pothole.util.PasswordGenerator;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;

    public UserService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            EmailService emailService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.emailService = emailService;
    }

    public List<UserResponse> listAll() {
        return userRepository.findAll().stream()
                .map(UserResponse::from)
                .collect(Collectors.toList());
    }

    public UserResponse getById(String id) {
        return UserResponse.from(findUser(id));
    }

    public CreateUserResponse create(CreateUserRequest request, Role actorRole) {
        Role wanted = request.getRole();
        if (wanted == Role.SUPERADMIN) {
            throw new IllegalArgumentException("Le rôle Superadmin ne peut pas être créé ici.");
        }
        if (wanted == Role.ADMIN && actorRole != Role.SUPERADMIN) {
            throw new IllegalArgumentException("Seul un Superadmin peut créer un administrateur.");
        }
        if (wanted != Role.ADMIN && wanted != Role.OPERATOR && wanted != Role.VIEWER) {
            throw new IllegalArgumentException("Rôle invalide");
        }
        if (userRepository.existsByEmailIgnoreCase(request.getEmail())) {
            throw new IllegalArgumentException("Cet email est déjà utilisé");
        }

        String plainPassword = StringUtils.hasText(request.getPassword())
                ? request.getPassword().trim()
                : PasswordGenerator.randomPassword(12);

        User user = new User();
        user.setEmail(request.getEmail().trim().toLowerCase());
        user.setPasswordHash(passwordEncoder.encode(plainPassword));
        user.setFullName(request.getFullName().trim());
        user.setRole(request.getRole());
        user.setEnabled(true);
        Instant now = Instant.now();
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        User saved = userRepository.save(user);

        boolean emailSent = emailService.sendAccountCredentials(
                saved.getEmail(),
                saved.getFullName(),
                saved.getRole(),
                plainPassword);

        String message = emailSent
                ? "Compte créé — identifiants envoyés à " + saved.getEmail()
                : "Compte créé — email non envoyé (vérifiez SMTP_USER / SMTP_PASS dans la configuration)";

        return new CreateUserResponse(UserResponse.from(saved), emailSent, message);
    }

    public UserResponse update(String id, UpdateUserRequest request) {
        User user = findUser(id);
        if (request.getFullName() != null && !request.getFullName().isBlank()) {
            user.setFullName(request.getFullName().trim());
        }
        if (request.getRole() != null) {
            if (request.getRole() == Role.SUPERADMIN || user.getRole() == Role.SUPERADMIN) {
                throw new IllegalArgumentException("Le rôle Superadmin ne peut pas être modifié ici.");
            }
            user.setRole(request.getRole());
        }
        if (request.getEnabled() != null) {
            user.setEnabled(request.getEnabled());
        }
        if (request.getPassword() != null && !request.getPassword().isBlank()) {
            user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        }
        user.setUpdatedAt(Instant.now());
        return UserResponse.from(userRepository.save(user));
    }

    public void delete(String id, Role actorRole, String actorId) {
        User target = findUser(id);
        if (id.equals(actorId)) {
            throw new IllegalArgumentException("Vous ne pouvez pas supprimer votre propre compte.");
        }
        if (target.getRole() == Role.SUPERADMIN) {
            throw new IllegalArgumentException("Le Superadmin ne peut pas être supprimé.");
        }
        if (target.getRole() == Role.ADMIN && actorRole != Role.SUPERADMIN) {
            throw new IllegalArgumentException("Seul un Superadmin peut supprimer un administrateur.");
        }
        userRepository.deleteById(id);
    }

    private User findUser(String id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Utilisateur introuvable"));
    }
}
