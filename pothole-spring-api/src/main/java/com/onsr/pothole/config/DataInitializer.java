package com.onsr.pothole.config;

import com.onsr.pothole.model.Role;
import com.onsr.pothole.model.User;
import com.onsr.pothole.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

@Component
public class DataInitializer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataInitializer.class);

    private final UserRepository userRepository;

    public DataInitializer(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public void run(String... args) {
        if (!userRepository.findByRole(Role.SUPERADMIN).isEmpty()) {
            return;
        }
        List<User> admins = userRepository.findByRole(Role.ADMIN);
        if (admins.isEmpty()) {
            log.warn("Aucun Superadmin en base — un administrateur existant sera promu au prochain ajout");
            return;
        }
        promoteToSuperadmin(admins.get(0));
    }

    private void promoteToSuperadmin(User user) {
        if (user.getRole() == Role.SUPERADMIN) {
            return;
        }
        user.setRole(Role.SUPERADMIN);
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
        log.info("Compte {} promu Superadmin", user.getEmail());
    }
}
