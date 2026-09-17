package com.gmattrainer.controller;

import com.gmattrainer.exception.ApiException;
import com.gmattrainer.dto.ProgressDtos.MigrationRequest;
import com.gmattrainer.service.ProgressGatewayService;
import com.gmattrainer.security.CurrentUser;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ProgressController {
    private final ProgressGatewayService progress;

    public ProgressController(ProgressGatewayService progress) {
        this.progress = progress;
    }

    @GetMapping("/progress")
    public Map<String,Object> progress(Authentication authentication) {
        return progress.read(required(authentication));
    }

    @PostMapping("/progress")
    public Map<String,Object> migrate(@RequestBody MigrationRequest request, Authentication authentication) {
        return progress.migrate(required(authentication), request.legacy());
    }

    @GetMapping("/history")
    public Map<String,Object> history(@RequestParam(defaultValue = "") String types,
                                      @RequestParam(defaultValue = "100") int limit,
                                      Authentication authentication) {
        List<String> parsed = Arrays.stream(types.split(",")).filter(type -> type.matches("RC|CR|PS|DS")).toList();
        return progress.history(required(authentication), parsed, Math.max(1, Math.min(200, limit)));
    }

    private CurrentUser required(Authentication authentication) {
        return CurrentUser.from(authentication).orElseThrow(() ->
            new ApiException(HttpStatus.UNAUTHORIZED, "authentication_required", "Sign in to access cloud progress."));
    }
}
