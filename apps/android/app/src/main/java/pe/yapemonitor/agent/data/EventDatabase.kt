package pe.yapemonitor.agent.data

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

const val PENDING = "pending"
const val SENT = "sent"
const val FAILED = "failed"

@Entity(
    tableName = "notification_events",
    indices = [
        Index(value = ["bindingId", "fingerprint"], unique = true),
        Index(value = ["bindingId", "state", "capturedMillis"]),
    ],
)
data class QueuedEvent(
    @PrimaryKey val id: String,
    val bindingId: String,
    val fingerprint: String,
    val capturedMillis: Long,
    val requestJson: String,
    val sender: String?,
    val amount: String?,
    val currency: String?,
    val state: String = PENDING,
    val backendStatus: String? = null,
    val failureCode: Int? = null,
)

data class QueueCounts(val sent: Int = 0, val pending: Int = 0, val failed: Int = 0)

@Dao
interface EventQueue {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(event: QueuedEvent): Long

    @Query("SELECT * FROM notification_events WHERE bindingId = :bindingId AND state = 'pending' ORDER BY capturedMillis, id LIMIT :limit")
    suspend fun pending(bindingId: String, limit: Int): List<QueuedEvent>

    @Query("UPDATE notification_events SET state = :state, backendStatus = :backendStatus, failureCode = :failureCode WHERE bindingId = :bindingId AND id = :eventId AND state = 'pending'")
    suspend fun settle(bindingId: String, eventId: String, state: String, backendStatus: String?, failureCode: Int?)

    @Query("SELECT * FROM notification_events WHERE bindingId = :bindingId ORDER BY capturedMillis DESC, id DESC LIMIT 50")
    fun history(bindingId: String): Flow<List<QueuedEvent>>

    @Query("""
        SELECT
            COUNT(CASE WHEN state = 'sent' THEN 1 END) AS sent,
            COUNT(CASE WHEN state = 'pending' THEN 1 END) AS pending,
            COUNT(CASE WHEN state = 'failed' THEN 1 END) AS failed
        FROM notification_events WHERE bindingId = :bindingId
    """)
    fun counts(bindingId: String): Flow<QueueCounts>

    @Query("DELETE FROM notification_events WHERE bindingId = :bindingId")
    suspend fun purge(bindingId: String)
}

@Database(entities = [QueuedEvent::class], version = 1, exportSchema = true)
abstract class EventDatabase : RoomDatabase() {
    abstract fun queue(): EventQueue
}
