package com.gmattrainer.progressservice.controller;

import com.gmattrainer.progressservice.dto.ProgressDtos.MigrationRequest;
import com.gmattrainer.progressservice.service.InternalAuthorizationService;
import com.gmattrainer.progressservice.service.ProgressApplicationService;
import jakarta.validation.Valid;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal")
public class InternalProgressController {
    private final InternalAuthorizationService authorization;
    private final ProgressApplicationService progress;
    public InternalProgressController(InternalAuthorizationService authorization,ProgressApplicationService progress){
        this.authorization=authorization;this.progress=progress;
    }
    @GetMapping("/health")
    public Map<String,Object> health(@RequestHeader("X-Internal-Token") String token){authorization.require(token);return progress.health();}
    @GetMapping("/users/{userId}/progress")
    public Map<String,Object> read(@RequestHeader("X-Internal-Token") String token,@PathVariable UUID userId){
        authorization.require(token);return Map.of("progress",progress.read(userId));
    }
    @PostMapping("/users/{userId}/progress/migrations")
    public Map<String,Object> migrate(@RequestHeader("X-Internal-Token") String token,@PathVariable UUID userId,
                                      @Valid @RequestBody MigrationRequest request){
        authorization.require(token);return progress.migrate(userId,request.legacy());
    }
    @GetMapping("/users/{userId}/history")
    public Map<String,Object> history(@RequestHeader("X-Internal-Token") String token,@PathVariable UUID userId,
                                      @RequestParam(defaultValue="") String types,@RequestParam(defaultValue="100") int limit){
        authorization.require(token);
        List<String> parsed=Arrays.stream(types.split(",")).filter(t->t.matches("RC|CR|PS|DS")).toList();
        return Map.of("rows",progress.history(userId,parsed,Math.max(1,Math.min(200,limit))));
    }
}
