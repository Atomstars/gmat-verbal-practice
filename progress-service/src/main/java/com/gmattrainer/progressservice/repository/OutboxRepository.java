package com.gmattrainer.progressservice.repository;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.gmattrainer.progressservice.dto.OutboxEvent;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class OutboxRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public OutboxRepository(JdbcTemplate jdbc,ObjectMapper json){this.jdbc=jdbc;this.json=json;}

    public List<OutboxEvent> pending(int limit){
        return jdbc.query("""
            with candidates as (
              select id from public.integration_outbox
              where processed_at is null and dead_lettered_at is null and available_at<=now()
              order by occurred_at for update skip locked limit ?
            )
            update public.integration_outbox event
            set available_at=now()+interval '30 seconds'
            from candidates where event.id=candidates.id
            returning event.id,event.event_type,event.aggregate_type,event.aggregate_id,event.payload::text
            """,(rs,row)->{
                try{return new OutboxEvent((UUID)rs.getObject(1),rs.getString(2),rs.getString(3),rs.getString(4),
                    json.readTree(rs.getString(5)));}
                catch(Exception e){throw new IllegalStateException("Invalid outbox payload",e);}
            },limit);
    }
    public boolean claim(UUID id,String eventType,String aggregateType,String aggregateId){
        return jdbc.update("""
            insert into progress_service.processed_events(event_id,event_type,aggregate_type,aggregate_id) values (?,?,?,?)
            on conflict do nothing
            """,id,eventType,aggregateType,aggregateId)==1;
    }
    public void markProcessed(UUID id){
        jdbc.update("update public.integration_outbox set processed_at=now(),last_error=null where id=?",id);
    }
    public void recordFailure(UUID id,String error){
        String safe=error==null?"Unknown consumer failure":error.substring(0,Math.min(1000,error.length()));
        jdbc.update("""
            update public.integration_outbox set attempts=attempts+1,last_error=?,
              available_at=now()+(least(300,power(2,least(attempts,8))::integer)*interval '1 second'),
              dead_lettered_at=case when attempts+1>=10 then now() else dead_lettered_at end
            where id=? and processed_at is null
            """,safe,id);
    }
    public long pendingCount(){return count("processed_at is null and dead_lettered_at is null");}
    public long deadLetterCount(){return count("dead_lettered_at is not null");}
    private long count(String condition){
        Long value=jdbc.queryForObject("select count(*) from public.integration_outbox where "+condition,Long.class);
        return value==null?0:value;
    }
}
