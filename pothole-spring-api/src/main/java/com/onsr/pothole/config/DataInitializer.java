package com.onsr.pothole.config;

import com.onsr.pothole.model.Role;
import com.onsr.pothole.model.User;
import com.onsr.pothole.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component
public class DataInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AppProperties appProperties;

    public DataInitializer(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            AppProperties appProperties) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.appProperties = appProperties;
    }

    @Override
    public void run(String... args) {
        if (userRepository.count() > 0) {
            return;
        }
        AppProperties.Admin admin = appProperties.getAdmin();
        User user = new User();
        user.setEmail(admin.getEmail());
        user.setPasswordHash(passwordEncoder.encode(admin.getPassword()));
        user.setFullName(admin.getFullName());
        user.setRole(Role.ADMIN);
        user.setEnabled(true);
        user.setCreatedAt(Instant.now());
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
        log.info("Compte admin initial créé : {}", admin.getEmail());
    }
}
