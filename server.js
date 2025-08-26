const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const { json } = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const path = require('path');

const credentials = dotenv.config().parsed;
const BCRYPT_ROUNDS = 10;

const app = express();
app.use(json());
app.use(express.static('public'));

// Configuración de PostgreSQL
const pool = new Pool({
    user: credentials.DB_USER,
    host: credentials.DB_HOST,
    database: credentials.DB_NAME,
    password: credentials.DB_PASS,
    port: credentials.PORT,

    max: 8,
    min: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 3000,
    acquireTimeoutMillis: 30000,
    maxUses: 5000,
    statement_timeout: 30000,
    query_timeout: 30000,
});

// Almacena el archivo en memoria como Buffer
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
        fieldSize: 1024 * 1024,
        files: 1
    }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // 5 intentos por IP
    message: {
        success: false,
        error: 'Demasiados intentos de login. Intenta en 15 minutos.'
    }
});

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Token de acceso requerido',
            code: 'MISSING_TOKEN'
        });
    }

    try {
        const decoded = jwt.verify(token, credentials.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        let statusCode = 403;
        let errorMessage = 'Token inválido';
        let errorCode = 'INVALID_TOKEN';

        if (err.name === "TokenExpiredError") {
            statusCode = 401;
            errorMessage = 'Token expirado';
            errorCode = 'TOKEN_EXPIRED';
        } else if (err.name === "JsonWebTokenError") {
            statusCode = 403;
            errorMessage = 'Token malformado';
            errorCode = 'MALFORMED_TOKEN';
        }

        return res.status(statusCode).json({
            success: false,
            error: errorMessage,
            code: errorCode
        });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            error: 'Permisos de administrador requeridos'
        });
    }
    next();
};


const corsPrivateOptions = {
    origin: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    credentials: true,
    optionsSuccessStatus: 200
};

const corsPublicOptions = {
    origin: false,
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    optionsSuccessStatus: 200
};


//CORS confiruguration
// Para rutas simples sin autenticación
app.use('/api/v1/login', cors(corsPublicOptions));
app.use('/api/v1/verify-token', cors(corsPublicOptions));

// Para rutas privadas que requieren autenticación
app.use('/api/v1/upload-excel', cors(corsPrivateOptions));
app.use('/api/v1/get-excel', cors(corsPrivateOptions));
app.use('/api/v1/delete-excel', cors(corsPrivateOptions));
app.use('/api/v1/files', cors(corsPrivateOptions));
app.use('/api/v1/new-password', cors(corsPrivateOptions));


// Crear tabla si no existe (ejecutar una sola vez)
async function createTable() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS single_excel_file (
                id INT PRIMARY KEY DEFAULT 1,
                file_name VARCHAR(255) NOT NULL,
                file_data BYTEA NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT one_row_only CHECK (id = 1)
        );`);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS password_rol (
                id SERIAL PRIMARY KEY,
                role VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL
            );
        `);

        // Check and insert admin user
        const adminExists = await pool.query('SELECT * FROM password_rol WHERE role = $1;', ['admin']);
        if (adminExists.rows.length === 0) {
            const adminPass = await bcrypt.hash("admin123", BCRYPT_ROUNDS);
            await pool.query(
                "INSERT INTO password_rol (role, password_hash) VALUES ($1, $2);",
                ["admin", adminPass]
            );
        }

        // Check and insert guest user
        const guestExists = await pool.query('SELECT * FROM password_rol WHERE role = $1;', ['guest']);
        if (guestExists.rows.length === 0) {
            const guestPass = await bcrypt.hash("guest123", BCRYPT_ROUNDS);
            await pool.query(
                'INSERT INTO password_rol (role, password_hash) VALUES ($1, $2);',
                ["guest", guestPass]
            );
        }


        console.log('Tabla creada o ya existente');
    } catch (err) {
        console.error('Error al crear tabla:', err);
    }
}

createTable();


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.post('/api/v1/login', loginLimiter, async (req, res) => {
    let result;
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({
                success: false,
                error: 'Contraseña requerida'
            })
        }

        result = await pool.query('SELECT role, password_hash FROM password_rol');
        const user = result.rows.find(row => bcrypt.compareSync(password, row.password_hash));

        if (!user) {
            return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
        }

        const token = jwt.sign(
            {
                role: user.role
            },
            credentials.JWT_SECRET,
            {
                expiresIn: "1h"
            }
        )

        res.json({
            success: true,
            data: {
                token,
                role: user.role
            }
        })

    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).json({
            success: false,
            error: "Error interno del server"
        })
    } finally {
        if (result && result.rows) {
            result.rows.forEach(row => {
                row.password_hash = null;
            });
            result.rows = null;
            result = null;
        }
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
        const hasherPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
        await pool.query('UPDATE password_rol SET password_hash = $1 WHERE role = $2', [hasherPassword, 'guest'])

        return res.status(200).json({
            success: true,
            message: 'Contraseña actualizada correctamente'
        });

    } catch (err) {
        console.error('Error al actualizar la contraseña:', err);
        return res.status(500).json({
            success: false,
            error: 'Error interno del servidor'
        });
    }
})

app.get('/api/v1/verify-token', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];

    if (!token) {
        console.error('Token no proporcionado');
        return res.status(401).json({
            success: false,
            error: 'Token de acceso requerido',
            code: 'MISSING_TOKEN'
        });
    }

    try {
        const decoded = jwt.verify(token, credentials.JWT_SECRET);

        // console.log('Token verificado con éxito:', decoded);
        res.status(200).json({
            success: true,
            data: {
                role: decoded.role,
                valid: true,
            }
        });

    } catch (error) {
        console.error('Error al verificar el token:', error);
        let statusCode = 403;
        let errorMessage = 'Token inválido';
        let errorCode = 'INVALID_TOKEN';

        if (error.name === 'TokenExpiredError') {
            console.error('Token expirado');
            statusCode = 401;
            errorMessage = 'Token expirado';
            errorCode = 'TOKEN_EXPIRED';
        }

        return res.status(statusCode).json({
            success: false,
            error: errorMessage,
            code: errorCode,
        });
    }
});

app.post('/api/v1/upload-excel', authenticateToken, requireAdmin, upload.single('excelFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No se subió ningún archivo');
    }

    const validMimeTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
    ];

    if (!validMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: 'Formato de Archivo invalido' });
    }

    if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ error: 'Archivo demasiado grande' });
    }

    try {
        // Usamos INSERT con ON CONFLICT para sobrescribir
        await pool.query(`
        INSERT INTO single_excel_file (id, file_name, file_data)
        VALUES (1, $1, $2)
        ON CONFLICT (id) DO UPDATE SET
        file_name = EXCLUDED.file_name,
        file_data = EXCLUDED.file_data,
        uploaded_at = CURRENT_TIMESTAMP
    `, [req.file.originalname, req.file.buffer]);

        res.status(200).send('Archivo Excel actualizado correctamente');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al guardar el archivo');
    } finally {
        if (req.file) {
            req.file.buffer = null;
            req.file = null;
        }
    }
});

// Ruta para obtener el archivo actual
app.get('/api/v1/get-excel', authenticateToken, async (req, res) => {
    let result;
    try {
        result = await pool.query(
            `SELECT file_name, file_data FROM single_excel_file WHERE id = 1`
        );

        if (result.rows.length === 0) {
            return res.status(404).send('No hay archivo almacenado');
        }

        const file = result.rows[0];
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
        res.send(file.file_data);

    } catch (err) {
        res.status(500).send('Error al recuperar el archivo');
    } finally {
        if (result && result.rows) {
            result.rows.forEach(row => {
                if (row.file_data) {
                    row.file_data = null;
                }
            });
            result.rows = null;
            result = null;
        }
    }
});

// Ruta para eliminar el archivo
app.delete('/api/v1/delete-excel', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM single_excel_file WHERE id = 1;');
        res.status(200).json({
            success: true,
            message: "Archivo eliminado con exito!"
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            error: "Error al eliminar el archivo"
        });
    }
});

app.get("/api/v1/files", authenticateToken, async (req, res) => {
    try {
        result = await pool.query(`
            SELECT id, file_name, TO_CHAR(uploaded_at, 'YYYY-MM-DD') AS uploaded_date
            FROM single_excel_file;
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
        console.error(err);
        res.status(500).send('Error al obtener los archivos');
    }
})

app.use((req, res, next) => {

    // Si es la ruta de inicio, continuar normalmente
    if (req.path === '/') {
        return next();
    }

    // Si es ruta raíz, redirigir a inicio
    if (req.path === '/' || req.path === '') {
        return res.redirect('http://localhost:3000/inicio');
    }

    // Si es API que no existe, redirigir (o podrías devolver 404)
    if (req.path.startsWith('/api')) {
        return res.redirect('http://localhost:3000/inicio');
    }

    // Si es archivo estático que no existe, redirigir
    if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|html)$/)) {
        return res.redirect('http://localhost:3000/inicio');
    }

    // Para cualquier otra ruta, redirigir
    res.redirect('http://localhost:3000/');
});

app.listen(3000, () => console.log('Servidor en http://localhost:3000'));