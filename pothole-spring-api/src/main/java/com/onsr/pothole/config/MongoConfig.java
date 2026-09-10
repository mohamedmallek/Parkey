package com.onsr.pothole.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.data.mongodb.core.convert.MongoCustomConversions;

import java.time.Instant;
import java.util.Date;

@Configuration
public class MongoConfig {

    @Bean
    public MongoCustomConversions mongoCustomConversions() {
        return MongoCustomConversions.create(config -> {
            config.registerConverter(new Converter<Date, Instant>() {
                @Override
                public Instant convert(Date source) {
                    return source.toInstant();
                }
            });
            config.registerConverter(new Converter<Instant, Date>() {
                @Override
                public Date convert(Instant source) {
                    return Date.from(source);
                }
            });
        });
    }
}
