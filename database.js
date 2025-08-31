const { Pool } = require('pg');
let poolEnded = false;
let shuttingDown = false;

console.log(poolEnded, shuttingDown);

// Configuración del pool con mejor manejo de errores
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 3,
    min: 0, // Cambiado a 0 para evitar conexiones idle problemáticas
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    acquireTimeoutMillis: 20000,
    maxUses: 3000,
    statement_timeout: 15000,
    query_timeout: 15000,
});

// ⚠️ CRÍTICO: Manejar todos los eventos de error del pool
pool.on('error', (err, client) => {
    console.error('❌ Error inesperado del pool:', {
        message: err.message,
        code: err.code,
        stack: err.stack
    });

    // No hacer process.exit aquí, solo logear
    console.log('🔄 Pool continuará funcionando...');
});

pool.on('connect', (client) => {
    console.log('🔗 Nueva conexión establecida al pool');

    // Manejar errores del client individual
    client.on('error', (err) => {
        console.error('❌ Error en client individual:', err.message);
    });
});

pool.on('acquire', (client) => {
    console.log('📥 Client adquirido del pool');
});

pool.on('release', (err, client) => {
    if (err) {
        console.error('⚠️ Error al liberar client:', err.message);
    } else {
        console.log('📤 Client liberado al pool');
    }
});

pool.on('remove', (client) => {
    console.log('🗑️ Client removido del pool');
});

// Función segura para queries con reintentos
const safeQuery = async (text, params = [], retries = 3) => {
    let lastError;

    if (shuttingDown) {
        throw new Error('Pool cerrado, no se pueden ejecutar queries');
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
        let client;
        try {
            client = await pool.connect();
            const result = await client.query(text, params);
            return result;
        } catch (err) {
            lastError = err;
            console.error(`❌ Query falló (intento ${attempt}/${retries}):`, {
                message: err.message,
                code: err.code,
                query: text.substring(0, 100) + '...'
            });

            // Verificar si es un error recuperable
            const recoverableErrors = [
                'ECONNRESET',
                'ENOTFOUND',
                'ECONNREFUSED',
                'ETIMEDOUT',
                'connection terminated'
            ];

            const isRecoverable = recoverableErrors.some(errorCode =>
                err.code === errorCode || err.message.includes(errorCode)
            );

            if (!isRecoverable || attempt === retries) {
                break;
            }

            // Esperar antes del siguiente intento
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));

        } finally {
            if (client) {
                try {
                    client.release();
                } catch (releaseErr) {
                    console.error('❌ Error al liberar client:', releaseErr.message);
                }
            }
        }
    }

    throw lastError;
};

// Función para verificar la salud de la conexión
const checkPoolHealth = async () => {
    try {
        const result = await safeQuery('SELECT NOW() as current_time, version() as pg_version');
        console.log('✅ Pool saludable:', {
            time: result.rows[0].current_time,
            totalConnections: pool.totalCount,
            idleConnections: pool.idleCount,
            waitingClients: pool.waitingCount
        });
        return true;
    } catch (err) {
        console.error('❌ Pool no saludable:', err.message);
        return false;
    }
};

// Función para limpiar el pool de manera segura
const cleanupPool = async () => {
    if (poolEnded) return;
    poolEnded = true;

    try {
        console.log('🧹 Limpiando pool...');

        // Información del estado actual
        console.log('📊 Estado del pool:', {
            total: pool.totalCount,
            idle: pool.idleCount,
            waiting: pool.waitingCount
        });

        // Cerrar todas las conexiones
        await pool.end();
        console.log('✅ Pool cerrado correctamente');

    } catch (err) {
        console.error('❌ Error al cerrar pool:', err.message);
        // Forzar cierre si es necesario
        process.exit(1);
    }
};

// Monitoreo periódico del pool (opcional, solo para debugging)
if (process.env.NODE_ENV !== 'production') {
    setInterval(async () => {
        console.log('📊 Estado del pool:', {
            total: pool.totalCount,
            idle: pool.idleCount,
            waiting: pool.waitingCount,
            poolEnded: poolEnded,
            shuttingDown: shuttingDown
        });
    }, 60000); // Cada minuto
}

// Manejo de señales del sistema
process.on('SIGTERM', async () => {
    shuttingDown = true;
    console.log('📡 SIGTERM recibido, cerrando pool...');
    await cleanupPool();
    if (process.env.NODE_ENV !== 'production') {
        process.exit(0);
    }
});

process.on('SIGINT', async () => {
    shuttingDown = true;
    console.log('📡 SIGINT recibido, cerrando pool...');
    await cleanupPool();
    if (process.env.NODE_ENV !== 'production') {
        process.exit(0);
    }
});

// Manejar excepciones no capturadas que podrían afectar al pool
process.on('uncaughtException', (err) => {
    console.error('💥 Excepción no capturada:', err);
    // NO cerrar el pool acá, mejor dejar que siga corriendo
});

process.on('unhandledRejection', (reason) => {
    console.error('🚫 Promesa rechazada no manejada:', reason);
    // Tampoco cerrar el pool
});

// Función de inicialización mejorada
const initializeDatabase = async () => {
    console.log('🚀 Inicializando conexión a la base de datos...');

    // Verificar que las variables de entorno estén configuradas
    if (!process.env.DATABASE_URL) {
        throw new Error('❌ DATABASE_URL no está configurada');
    }

    if (!process.env.JWT_SECRET) {
        throw new Error('❌ JWT_SECRET no está configurada');
    }

    // Probar la conexión inicial
    const isHealthy = await checkPoolHealth();
    if (!isHealthy) {
        throw new Error('❌ No se pudo establecer conexión inicial con la DB');
    }

    console.log('✅ Conexión a base de datos establecida correctamente');
};

module.exports = {
    pool,
    safeQuery,
    checkPoolHealth,
    cleanupPool,
    initializeDatabase
};