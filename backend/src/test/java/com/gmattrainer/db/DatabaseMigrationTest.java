package com.gmattrainer.db;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class DatabaseMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES =
        new PostgreSQLContainer<>("pgvector/pgvector:pg16");

    @Test
    void createsRelationalSchemaAnd384DimensionVectorColumn() throws Exception {
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
            .locations("classpath:db/migration").load().migrate();
        try (var connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             var statement = connection.createStatement()) {
            try (var rs = statement.executeQuery("select count(*) from information_schema.tables " +
                "where table_schema='public' and table_name in ('app_users','questions','question_embeddings'," +
                "'practice_sessions','question_attempts','user_progress','user_study_state','knowledge_chunks','integration_outbox')")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt(1)).isEqualTo(9);
            }
            try (var rs = statement.executeQuery("select count(*) from information_schema.tables " +
                "where table_schema='progress_service' and table_name in ('user_progress','user_study_state','processed_events')")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt(1)).isEqualTo(3);
            }
            try (var rs = statement.executeQuery("select format_type(a.atttypid,a.atttypmod) from pg_attribute a " +
                "join pg_class c on c.oid=a.attrelid where c.relname='question_embeddings' and a.attname='embedding'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getString(1)).isEqualTo("vector(384)");
            }
            try (var rs = statement.executeQuery("select format_type(a.atttypid,a.atttypmod) from pg_attribute a " +
                "join pg_class c on c.oid=a.attrelid where c.relname='knowledge_chunks' and a.attname='embedding'")) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getString(1)).isEqualTo("vector(384)");
            }
        }
    }
}
