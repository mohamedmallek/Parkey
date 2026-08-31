package com.onsr.pothole.config;

import com.onsr.pothole.model.EventStatus;
import com.onsr.pothole.model.RoadEvent;
import com.onsr.pothole.model.StatusHistoryEntry;
import com.onsr.pothole.repository.RoadEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/** Initialise le statut NOUVEAU sur les événements existants (migration douce). */
@Component
@Order(2)
public class EventStatusBackfill implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(EventStatusBackfill.class);

    private final RoadEventRepository roadEventRepository;

    public EventStatusBackfill(RoadEventRepository roadEventRepository) {
        this.roadEventRepository = roadEventRepository;
    }

    @Override
    public void run(String... args) {
        List<RoadEvent> events = roadEventRepository.findAll();
        int updated = 0;
        for (RoadEvent e : events) {
            if (e.getStatus() != null) {
                continue;
            }
            e.setStatus(EventStatus.NOUVEAU);
            if (e.getStatusHistory() == null || e.getStatusHistory().isEmpty()) {
                StatusHistoryEntry entry = new StatusHistoryEntry();
                entry.setTsMs(e.getTsMs() != null ? e.getTsMs() : System.currentTimeMillis());
                entry.setFromStatus(null);
                entry.setToStatus(EventStatus.NOUVEAU);
                entry.setUserName("Système IA");
                entry.setUserRole("SYSTEM");
                entry.setNote("Migration — détection IA (événement antérieur)");
                e.setStatusHistory(new ArrayList<>(List.of(entry)));
            }
            roadEventRepository.save(e);
            updated++;
        }
        if (updated > 0) {
            log.info("Workflow signalements : {} événement(s) migré(s) vers NOUVEAU", updated);
        }
    }
}
