package com.onsr.pothole.controller;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Test unitaire simple, sans contexte Spring (pas besoin de MongoDB),
 * juste pour valider le endpoint de health check et permettre a la
 * pipeline CI de generer un rapport de couverture Jacoco.
 */
class HealthControllerTest {

    @Test
    void healthShouldReturnOkStatus() {
        HealthController controller = new HealthController();

        ResponseEntity<Map<String, Object>> response = controller.health();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody()).containsEntry("ok", true);
        assertThat(response.getBody()).containsEntry("service", "onsr-spring-api");
    }
}
