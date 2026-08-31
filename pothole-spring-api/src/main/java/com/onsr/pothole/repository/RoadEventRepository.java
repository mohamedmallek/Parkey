package com.onsr.pothole.repository;

import com.onsr.pothole.model.RoadEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface RoadEventRepository extends MongoRepository<RoadEvent, String> {
    List<RoadEvent> findAllByOrderByTsMsDesc(Pageable pageable);
}
