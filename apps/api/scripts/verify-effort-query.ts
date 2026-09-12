import { pool } from "../src/db.js";

const SESSION_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  // WITH NO DATA continuous aggregate + a procedure that can't run inside a
  // transaction block, so this stands alone rather than living in a migration.
  await pool.query("CALL refresh_continuous_aggregate('samples_1m', NULL, NULL)");

  const { rows } = await pool.query(
    `WITH context_ranges AS (
       SELECT ci.session_id, ci.category, ci.time AS start_ts,
         COALESCE(
           LEAD(ci.time) OVER (PARTITION BY ci.session_id ORDER BY ci.time),
           s.ended_at
         ) AS end_ts
       FROM context_intervals ci
       JOIN sessions s ON s.id = ci.session_id
     )
     SELECT c.category, count(*) AS minutes,
       avg(p.avg_hrv_ms) AS mean_hrv_ms, avg(p.avg_pulse_bpm) AS mean_pulse_bpm
     FROM samples_1m p
     JOIN context_ranges c
       ON c.session_id = p.session_id
      AND p.bucket >= c.start_ts
      AND p.bucket <  c.end_ts
     WHERE p.session_id = $1
     GROUP BY c.category
     ORDER BY mean_hrv_ms ASC`,
    [SESSION_ID],
  );

  console.log("effort per category:");
  console.table(rows);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
