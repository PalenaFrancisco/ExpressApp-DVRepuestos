const express = require('express');
const multer = require('multer');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const { generalLimiter, loginLimiter, uploadLimiter } = require('./middlewares/rateLimiters');

// Importar la configuración del pool corregida
const { safeQuery, checkPoolHealth, initializeDatabase } = require('./database');

const BCRYPT_ROUNDS = 10;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', false);
app.use(express.static('public'));
app.use(generalLimiter);

// Middleware global para limpieza automática
const cleanupMiddleware = (req, res, next) => {
    const cleanup = () => {
        if (req.file) req.file.buffer = null;
        if (req.files) req.files.forEach(file => file.buffer = null);
        if (req.body?.password) req.body.password = null;
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);

    next();
};

app.use(cleanupMiddleware);

// Configuración de multer optimizada
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
        fieldSize: 100 * 1024,
        files: 1,
        parts: 2
    },
    fileFilter: (req, file, cb) => {
        const validMimeTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];

        if (validMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato de archivo inválido'), false);
        }
    }
});



// Middleware de autenticación
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Token de acceso requerido',
            code: 'MISSING_TOKEN'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        const errorMap = {
            'TokenExpiredError': { code: 401, msg: 'Token expirado', type: 'TOKEN_EXPIRED' },
            'JsonWebTokenError': { code: 403, msg: 'Token malformado', type: 'MALFORMED_TOKEN' }
        };

        const error = errorMap[err.name] || { code: 403, msg: 'Token inválido', type: 'INVALID_TOKEN' };

        return res.status(error.code).json({
            success: false,
            error: error.msg,
            code: error.type
        });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Permisos de administrador requeridos'
        });
    }
    next();
};

const corsOptionsDelegate = (req, callback) => {
    const publicRoutes = ['/api/v1/login', '/api/v1/verify-token'];
    const isPublic = publicRoutes.some(route => req.path.startsWith(route));

    const corsOptions = {
        origin: (origin, cb) => {
            const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [];
            if (!origin || allowedOrigins.includes(origin)) {
                cb(null, true);
            } else {
                cb(new Error('CORS bloqueado'));
            }
        },
        credentials: !isPublic,
    };

    callback(null, corsOptions);
};

app.use(cors(corsOptionsDelegate));

// Función para crear tablas con mejor manejo de errores
async function createTable() {
    try {
        console.log('🔍 Verificando existencia de tablas...');

        const tablesExist = await safeQuery(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'single_excel_file'
            ) AS excel_exists,
            EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'password_rol'
            ) AS password_exists;
        `);

        const { excel_exists, password_exists } = tablesExist.rows[0];

        if (excel_exists && password_exists) {
            console.log('✅ Las tablas ya existen, omitiendo creación');
            return;
        }

        if (!excel_exists) {
            await safeQuery(`
                CREATE TABLE IF NOT EXISTS single_excel_file (
                    id INT PRIMARY KEY DEFAULT 1,
                    file_name VARCHAR(255) NOT NULL,
                    file_data BYTEA NOT NULL,
                    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT one_row_only CHECK (id = 1)
            );`);
            console.log('✅ Tabla single_excel_file creada');
        }

        if (!password_exists) {
            await safeQuery(`
                CREATE TABLE IF NOT EXISTS password_rol (
                    id SERIAL PRIMARY KEY,
                    role VARCHAR(255) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL
                );
            `);
            console.log('✅ Tabla password_rol creada');

            const adminPass = await bcrypt.hash("admin123", BCRYPT_ROUNDS);
            const guestPass = await bcrypt.hash("guest123", BCRYPT_ROUNDS);

            await safeQuery(
                "INSERT INTO password_rol (role, password_hash) VALUES ($1, $2), ($3, $4);",
                ["admin", adminPass, "guest", guestPass]
            );
            console.log('✅ Usuarios iniciales creados');
        }

    } catch (err) {
        console.error('❌ Error en createTable:', {
            message: err.message,
            code: err.code,
            stack: err.stack
        });

        if (process.env.NODE_ENV === 'production') {
            console.log('⚠️ Continuando sin crear tablas en producción...');
            return;
        }
        throw err;
    }
}

// Rutas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint de health check
app.get('/api/v1/health', async (req, res) => {
    try {
        const isHealthy = await checkPoolHealth();
        res.status(200).json({
            success: true,
            status: isHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            status: 'error',
            error: err.message
        });
    }
});

app.post('/api/v1/login', loginLimiter, async (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({
            success: false,
            error: 'Contraseña requerida'
        });
    }

    try {
        const result = await safeQuery('SELECT role, password_hash FROM password_rol');

        let user = null;
        for (const row of result.rows) {
            if (bcrypt.compareSync(password, row.password_hash)) {
                user = { role: row.role };
                break;
            }
            row.password_hash = null;
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Contraseña incorrecta'
            });
        }

        const token = jwt.sign(
            { role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        res.json({
            success: true,
            data: { token, role: user.role }
        });

    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
});

app.post('/api/v1/new-password', authenticateToken, requireAdmin, async (req, res) => {
    const { newPassword } = req.body;

    if (!newPassword) {
        return res.status(400).json({
            success: false,
            error: 'Nueva contraseña requerida'
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await safeQuery('UPDATE password_rol SET password_hash = $1 WHERE role = $2',
            [hashedPassword, 'guest']);

        res.status(200).json({
            success: true,
            message: 'Contraseña actualizada correctamente'
        });

    } catch (err) {
        console.error('Error al actualizar la contraseña:', err);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
});

app.get('/api/v1/verify-token', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Token de acceso requerido',
            code: 'MISSING_TOKEN'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        res.status(200).json({
            success: true,
            data: {
                role: decoded.role,
                valid: true,
            }
        });

    } catch (error) {
        const errorMap = {
            'TokenExpiredError': { code: 401, msg: 'Token expirado', type: 'TOKEN_EXPIRED' },
            'JsonWebTokenError': { code: 403, msg: 'Token inválido', type: 'INVALID_TOKEN' }
        };

        const err = errorMap[error.name] || { code: 403, msg: 'Token inválido', type: 'INVALID_TOKEN' };

        return res.status(err.code).json({
            success: false,
            error: err.msg,
            code: err.type,
        });
    }
});

app.post('/api/v1/upload-excel', authenticateToken, requireAdmin, uploadLimiter, upload.single('excelFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            error: 'No se subió ningún archivo'
        });
    }

    if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({
            success: false,
            error: 'Archivo demasiado grande (máximo 10MB)'
        });
    }

    try {
        await safeQuery(`
            INSERT INTO single_excel_file (id, file_name, file_data)
            VALUES (1, $1, $2)
            ON CONFLICT (id) DO UPDATE SET
            file_name = EXCLUDED.file_name,
            file_data = EXCLUDED.file_data,
            uploaded_at = CURRENT_TIMESTAMP
        `, [req.file.originalname, req.file.buffer]);

        res.status(200).json({
            success: true,
            message: 'Archivo Excel actualizado correctamente'
        });

    } catch (err) {
        console.error('Error al guardar archivo:', err);
        res.status(500).json({
            success: false,
            error: 'Error al guardar el archivo'
        });
    }
});

app.get('/api/v1/get-excel', authenticateToken, async (req, res) => {
    try {
        const result = await safeQuery(
            'SELECT file_name, file_data FROM single_excel_file WHERE id = 1'
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No hay archivo almacenado'
            });
        }

        const file = result.rows[0];

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
        res.setHeader('Content-Length', file.file_data.length);

        res.end(file.file_data);
        file.file_data = null;

    } catch (err) {
        console.error('Error al recuperar archivo:', err);
        res.status(500).json({
            success: false,
            error: 'Error al recuperar el archivo'
        });
    }
});

app.delete('/api/v1/delete-excel', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await safeQuery('DELETE FROM single_excel_file WHERE id = 1');
        res.status(200).json({
            success: true,
            message: "Archivo eliminado con éxito!"
        });
    } catch (err) {
        console.error('Error al eliminar archivo:', err);
        res.status(500).json({
            success: false,
            error: "Error al eliminar el archivo"
        });
    }
});

app.get("/api/v1/files", authenticateToken, async (req, res) => {
    try {
        const result = await safeQuery(`
            SELECT id, file_name, TO_CHAR(uploaded_at, 'YYYY-MM-DD') AS uploaded_date
            FROM single_excel_file
        `);

        if (result.rows.length === 0) {
            return res.status(200).json({
                success: false,
                message: 'No hay archivos cargados'
            });
        }

        const file = result.rows[0];
        res.status(200).json({
            id: file.id,
            file_name: file.file_name,
            uploaded_date: file.uploaded_date,
            success: true
        });

    } catch (err) {
        console.error('Error al obtener archivos:', err);
        res.status(500).json({
            success: false,
            error: 'Error al obtener los archivos'
        });
    }
});

// Middleware para rutas no encontradas
app.use((req, res, next) => {
    if (req.path === '/') {
        return next();
    }

    if (req.path.startsWith('/api')) {
        return res.status(404).json({
            success: false,
            error: 'Endpoint no encontrado'
        });
    }

    res.redirect('/');
});

// Middleware global de manejo de errores
app.use((err, req, res, next) => {
    console.error('Error no manejado:', err);

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'Archivo demasiado grande'
            });
        }
        return res.status(400).json({
            success: false,
            error: 'Error al procesar archivo'
        });
    }

    res.status(500).json({
        success: false,
        error: 'Error interno del servidor'
    });
});

// Función principal de inicialización
const startServer = async () => {
    try {
        // Inicializar la base de datos
        await initializeDatabase();

        // Crear tablas si es necesario
        await createTable();

        const port = process.env.PORT || 3000;
        const server = app.listen(port, '0.0.0.0', () => {
            console.log(`🚀 Server running on port ${port}`);
        });

        server.timeout = 30000;

        return server;

    } catch (err) {
        console.error('❌ Error al iniciar servidor:', err);
        process.exit(1);
    }
};

// Iniciar el servidor
startServer().catch(console.error);

module.exports = { app, startServer };