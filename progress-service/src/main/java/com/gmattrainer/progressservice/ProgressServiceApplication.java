package com.gmattrainer.progressservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class ProgressServiceApplication {
    public static void main(String[] args) { SpringApplication.run(ProgressServiceApplication.class, args); }
}
