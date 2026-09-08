package com.onsr.pothole.repository;

import com.onsr.pothole.model.UserSession;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface UserSessionRepository extends MongoRepository<UserSession, String> {
    Optional<UserSession> findByIdAndUserId(String id, String userId);

    List<UserSession> findByUserIdOrderByLoginAtDesc(String userId);

    Page<UserSession> findByUserIdOrderByLoginAtDesc(String userId, Pageable pageable);

    List<UserSession> findByLogoutAtIsNullAndLastHeartbeatAtBefore(Instant threshold);
}
