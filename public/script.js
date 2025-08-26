let isUploading = false;
let currentDateFile = [];
let isLoggedIn = false;
let role = null;

// DOM Elements
const elements = {
    // Login elements
    loginScreen: document.getElementById('loginScreen'),
    loginForm: document.getElementById('loginForm'),
    loginPassword: document.getElementById('loginPassword'),
    loginBtn: document.getElementById('loginBtn'),
    loginText: document.getElementById('loginText'),
    loginSpinner: document.getElementById('loginSpinner'),
    loginError: document.getElementById('loginError'),
    dashboard: document.getElementById('dashboard'),

    // Dashboard elements
    fileStatus: document.getElementById('fileStatus'),
    uploadForm: document.getElementById('uploadForm'),
    excelFile: document.getElementById('excelFile'),
    uploadBtn: document.getElementById('uploadBtn'),
    uploadText: document.getElementById('uploadText'),
    uploadSpinner: document.getElementById('uploadSpinner'),
    successModal: document.getElementById('successModal'),
    successTitle: document.getElementById('successTitle'),
    successMessage: document.getElementById('successMessage'),
    dropZone: document.getElementById('dropZone'),
    deleteBtn: document.getElementById('deleteBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    uploadSection: document.getElementById('uploadSection'),
    actionSection: document.getElementById('actionSection'),

    // New password elements
    newPasswordSection: document.getElementById('newPasswordSection'),
    newPasswordForm: document.getElementById('newPasswordForm'),
    newPasswordInput: document.getElementById('newPassword'),
    changePasswordBtn: document.getElementById('changePasswordBtn'),
    showPasswordBtn: document.getElementById('showPasswordBtn'),
};

// File status templates
const fileTemplates = {
    loading: `<div class="loading-dots text-gray-200">Cargando</div>`,

    empty: `
                <div class="animate-fade-in">
                    <svg class="w-16 h-16 text-gray-400 mx-auto mb-3" viewBox="0 0 50 50">
                        <path fill="currentColor" d="M 28.8125 0.03125 L 0.8125 5.34375 C 0.339844 5.433594 0 5.863281 0 6.34375 L 0 43.65625 C 0 44.136719 0.339844 44.566406 0.8125 44.65625 L 28.8125 49.96875 C 28.875 49.980469 28.9375 50 29 50 C 29.230469 50 29.445313 49.929688 29.625 49.78125 C 29.855469 49.589844 30 49.296875 30 49 L 30 1 C 30 0.703125 29.855469 0.410156 29.625 0.21875 C 29.394531 0.0273438 29.105469 -0.0234375 28.8125 0.03125 Z M 32 6 L 32 13 L 34 13 L 34 15 L 32 15 L 32 20 L 34 20 L 34 22 L 32 22 L 32 27 L 34 27 L 34 29 L 32 29 L 32 35 L 34 35 L 34 37 L 32 37 L 32 44 L 47 44 C 48.101563 44 49 43.101563 49 42 L 49 8 C 49 6.898438 48.101563 6 47 6 Z M 36 13 L 44 13 L 44 15 L 36 15 Z M 36 20 L 44 20 L 44 22 L 36 22 Z M 36 27 L 44 27 L 44 29 L 36 29 Z M 36 35 L 44 35 L 44 37 L 36 37 Z"/>
                    </svg>
                    <p class="text-gray-300 font-medium">Sin archivos</p>
                    <p class="text-sm text-gray-400 mt-1">No hay ningún archivo, intenta mas tarde</p>
                </div>
            `,

    hasFile: (fileName, uploadDate) => `
                <div class="animate-slide-up">
                    <div class="bg-green-500 bg-opacity-20 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-3">
                        <svg class="w-10 h-10 text-green-400" viewBox="0 0 50 50">
                            <path fill="currentColor" d="M 28.8125 0.03125 L 0.8125 5.34375 C 0.339844 5.433594 0 5.863281 0 6.34375 L 0 43.65625 C 0 44.136719 0.339844 44.566406 0.8125 44.65625 L 28.8125 49.96875 C 28.875 49.980469 28.9375 50 29 50 C 29.230469 50 29.445313 49.929688 29.625 49.78125 C 29.855469 49.589844 30 49.296875 30 49 L 30 1 C 30 0.703125 29.855469 0.410156 29.625 0.21875 C 29.394531 0.0273438 29.105469 -0.0234375 28.8125 0.03125 Z M 32 6 L 32 13 L 34 13 L 34 15 L 32 15 L 32 20 L 34 20 L 34 22 L 32 22 L 32 27 L 34 27 L 34 29 L 32 29 L 32 35 L 34 35 L 34 37 L 32 37 L 32 44 L 47 44 C 48.101563 44 49 43.101563 49 42 L 49 8 C 49 6.898438 48.101563 6 47 6 Z M 36 13 L 44 13 L 44 15 L 36 15 Z M 36 20 L 44 20 L 44 22 L 36 22 Z M 36 27 L 44 27 L 44 29 L 36 29 Z M 36 35 L 44 35 L 44 37 L 36 37 Z"/>
                        </svg>
                    </div>
                    <p class="text-white font-semibold">${fileName}</p>
                    <p class="text-sm text-gray-300 mt-1">Actualizado el: ${uploadDate}</p>
                </div>
            `
};

// Login functions
const toggleLoginState = (loading) => {
    elements.loginBtn.disabled = loading;
    elements.loginText.textContent = loading ? 'Iniciando...' : 'Iniciar Sesión';
    elements.loginSpinner.classList.toggle('hidden', !loading);
};

const showLoginError = (message) => {

    if (message) {
        elements.loginError.textContent = message
        elements.loginError.querySelector('p').textContent = message;
    }

    elements.loginError.classList.remove('hidden');
    elements.loginError.classList.add('animate-shake');
    elements.loginPassword.value = '';
    elements.loginPassword.focus();

    setTimeout(() => {
        elements.loginError.classList.remove('animate-shake');
    }, 500);
};

const hideLoginScreen = () => {
    elements.loginScreen.classList.add('hide');

    setTimeout(() => {
        showDashboard();
    }, 500);
};

// Función para manejar el layout del grid de acciones
const updateActionSectionLayout = (role) => {
    const actionSection = elements.actionSection;

    // Remover todas las clases de grid-cols existentes
    actionSection.classList.remove('grid-cols-1', 'grid-cols-2');

    if (role === 'guest') {
        // Solo botón de descarga visible
        actionSection.classList.add('grid-cols-1');
        elements.deleteBtn.classList.add('hidden');
    } else if (role === 'admin') {
        // Ambos botones visibles
        actionSection.classList.add('grid-cols-2');
        elements.deleteBtn.classList.remove('hidden');
    }
};

// Función para aplicar restricciones basadas en el rol
const applyRoleRestrictions = (userRole) => {
    if (userRole === "guest") {
        hideNewPasswordSection();
        elements.uploadSection.classList.add('hidden');
        updateActionSectionLayout('guest');
    } else if (userRole === "admin") {
        showNewPasswordSection();
        elements.uploadSection.classList.remove('hidden');
        updateActionSectionLayout('admin');
    }
};

// Función de login actualizada
const login = async (password) => {
    try {
        const res = await fetch('/api/v1/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password })
        });

        if (res.ok) {
            const data = await res.json();
            role = data.data.role;
            localStorage.setItem('token', data.data.token);
            isLoggedIn = true;

            hideLoginScreen();
            applyRoleRestrictions(role);

        } else {
            showLoginError();
        }
    } catch (error) {
        showLoginError();
    }
};

// Función verifyToken actualizada
const verifyToken = async () => {
    const token = localStorage.getItem('token');

    if (!token) {
        showLoginScreen();
        return false;
    }

    try {
        const res = await fetch('/api/v1/verify-token', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await res.json();

        if (res.ok) {
            role = data.data.role;
            isLoggedIn = true;

            showDashboard();
            applyRoleRestrictions(role);

            return true;
        } else {
            localStorage.removeItem('token');
            isLoggedIn = false;
            role = null;
            showLoginScreen();
            const message = data?.error || 'Sesión expirada';
            showLoginError(message);
            return false;
        }
    } catch (error) {
        localStorage.removeItem('token');
        isLoggedIn = false;
        showLoginScreen();
        return false;
    }
};

const showLoginScreen = () => {
    elements.loginScreen.style.display = 'flex';
    elements.loginScreen.classList.remove('hide');
    elements.dashboard.classList.remove('show');
    elements.dashboard.style.display = 'none';

    elements.loginPassword.value = '';
    elements.loginError.classList.add('hidden');
};

const showDashboard = () => {
    elements.loginScreen.style.display = 'none';
    elements.loginScreen.classList.add('hide');
    elements.dashboard.style.display = 'flex';
    elements.dashboard.classList.add('show');

    initializeDashboard();
};

// Dashboard functions
const showSuccess = (title, message) => {
    const modalIcon = document.getElementById('modalIcon');
    const isError = title.toLowerCase().includes('error');
    // Configurar las clases del icono según el tipo
    modalIcon.className = `rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6 ${isError ? 'bg-red-100' : 'bg-green-100'}`;

    // Configurar el SVG según el tipo
    modalIcon.innerHTML = isError
        ? `<svg class="w-12 h-12 text-red-500" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
           </svg>`
        : `<svg class="w-12 h-12 text-green-500" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
           </svg>`;

    elements.successTitle.textContent = title;
    elements.successMessage.textContent = message;
    elements.successModal.classList.remove('hidden');
    elements.successModal.classList.add('flex');

    console.log(message);

    setTimeout(() => {
        elements.successModal.classList.add('hidden');
        elements.successModal.classList.remove('flex');
    }, 1500);
};

const toggleUploadState = (uploading) => {
    isUploading = uploading;
    elements.uploadBtn.disabled = uploading || !elements.excelFile.files.length;
    elements.uploadText.textContent = uploading ? 'Subiendo...' : 'Subir Archivo';
    elements.uploadSpinner.classList.toggle('hidden', !uploading);
};

const showSelectedFile = (file) => {
    const fileSize = (file.size / 1024 / 1024).toFixed(2);
    elements.dropZone.innerHTML = `
                <div class="animate-slide-up relative">
                    <button type="button" 
                        class="absolute top-2 right-2 text-red-400 hover:text-red-300 pointer-events-auto cursor-pointer rounded-full p-2 bg-gray-800 hover:bg-gray-700 transition-all"
                        id="deleteSelectedFileBtn">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                    <div class="bg-blue-500 bg-opacity-20 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-2">
                    <svg class="w-10 h-10 text-blue-400" viewBox="0 0 50 50">
                        <path fill="currentColor" d="M 28.8125 0.03125 L 0.8125 5.34375 C 0.339844 5.433594 0 5.863281 0 6.34375 L 0 43.65625 C 0 44.136719 0.339844 44.566406 0.8125 44.65625 L 28.8125 49.96875 C 28.875 49.980469 28.9375 50 29 50 C 29.230469 50 29.445313 49.929688 29.625 49.78125 C 29.855469 49.589844 30 49.296875 30 49 L 30 1 C 30 0.703125 29.855469 0.410156 29.625 0.21875 C 29.394531 0.0273438 29.105469 -0.0234375 28.8125 0.03125 Z M 32 6 L 32 13 L 34 13 L 34 15 L 32 15 L 32 20 L 34 20 L 34 22 L 32 22 L 32 27 L 34 27 L 34 29 L 32 29 L 32 35 L 34 35 L 34 37 L 32 37 L 32 44 L 47 44 C 48.101563 44 49 43.101563 49 42 L 49 8 C 49 6.898438 48.101563 6 47 6 Z M 36 13 L 44 13 L 44 15 L 36 15 Z M 36 20 L 44 20 L 44 22 L 36 22 Z M 36 27 L 44 27 L 44 29 L 36 29 Z M 36 35 L 44 35 L 44 37 L 36 37 Z"/>
                    </svg>
                    </div>
                    <p class="text-white font-semibold truncate px-4">${file.name}</p>
                    <p class="text-sm text-gray-300 mt-1">${fileSize} MB</p>
                    <button type="button" id="changeFileBtn" class="mt-3 text-white rounded-xl font-semibold w-[50%] py-3 bg-cyan-500">
                        Cambiar archivo
                    </button>
                </div>
            `;

    // Agregar event listeners a los botones dinámicamente creados
    const deleteSelectedBtn = document.getElementById('deleteSelectedFileBtn');
    const changeFileBtn = document.getElementById('changeFileBtn');

    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearSelectedFile();
        });
    }

    if (changeFileBtn) {
        changeFileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            elements.excelFile.click();
        });
    }
};

const resetDropZone = () => {

    elements.dropZone.innerHTML = `
                <svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                </svg>
                <div class="file-input">
                    <span class="text-white font-medium">Haz clic para seleccionar un archivo</span>
                </div>
                <p class="text-sm text-gray-300 mt-2">Solo archivos Excel (.xlsx, .xls)</p>
            `;

    elements.uploadForm.reset();

    // // Re-assign event listeners after DOM update
    // elements.excelFile = document.getElementById('excelFile');
    // elements.excelFile.addEventListener('change', handleFileChange);
};

const handleFileChange = () => {
    const file = elements.excelFile.files[0];

    if (!file) {
        resetDropZone();
        elements.uploadBtn.disabled = true;
        return;
    }

    const hasValidFile = file.name.match(/\.(xlsx|xls)$/i);

    if (hasValidFile) {
        elements.uploadBtn.disabled = isUploading;
        showSelectedFile(file);
        elements.uploadBtn.classList.add('animate-pulse-custom');
        setTimeout(() => elements.uploadBtn.classList.remove('animate-pulse-custom'), 300);
    } else {
        elements.uploadBtn.disabled = true;
        showSuccess("Error archivo no soportado", "Solo archivos Excel están permitidos");
        elements.excelFile.value = ''; // Limpiar el input
        resetDropZone();
    }
};

const handleShowPass = () => {
    if (elements.newPasswordInput.type === "password") {
        elements.newPasswordInput.type = "text"
        elements.showPasswordBtn.innerHTML = `
            <svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512">
                <path fill="currentColor" d="M38.8 5.1C28.4-3.1 13.3-1.2 5.1 9.2S-1.2 34.7 9.2 42.9l592 464c10.4 8.2 25.5 6.3 33.7-4.1s6.3-25.5-4.1-33.7L525.6 386.7c39.6-40.6 66.4-86.1 79.9-118.4c3.3-7.9 3.3-16.7 0-24.6c-14.9-35.7-46.2-87.7-93-131.1C465.5 68.8 400.8 32 320 32c-68.2 0-125 26.3-169.3 60.8L38.8 5.1zM223.1 149.5C248.6 126.2 282.7 112 320 112c8.8 0 16-7.2 16-16s-7.2-16-16-16c-44.2 0-80 35.8-80 80c0 8.8 7.2 16 16 16s16-7.2 16-16c0-14.3 5.9-27.2 15.4-36.5c-2.5 1.3-4.9 2.7-7.3 4.1zM373 389.9c-16.4 6.5-34.3 10.1-53 10.1c-56.6 0-104.4-37.1-120.3-88.3c-2.9-9.6-4.5-19.8-4.5-30.5c0-4.4 3.6-8 8-8h16c4.4 0 8 3.6 8 8c0 9.3 1.7 18.2 4.2 26.6c9.7 32.2 39.2 55.4 73.6 55.4c4.8 0 9.4-0.6 13.9-1.7l-35.5-27.8c-4.4-3.4-5.3-9.8-1.9-14.2s9.8-5.3 14.2-1.9l119.7 93.6c-6.2 3-12.8 5.5-19.7 7.4z"/>
            </svg>
        `;
    } else {
        elements.newPasswordInput.type = "password"
        elements.showPasswordBtn.innerHTML = `<svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512">
            <path fill="currentColor"
                d="M288 32c-80.8 0-145.5 36.8-192.6 80.6-46.8 43.5-78.1 95.4-93 131.1-3.3 7.9-3.3 16.7 0 24.6 14.9 35.7 46.2 87.7 93 131.1 47.1 43.7 111.8 80.6 192.6 80.6s145.5-36.8 192.6-80.6c46.8-43.5 78.1-95.4 93-131.1 3.3-7.9 3.3-16.7 0-24.6-14.9-35.7-46.2-87.7-93-131.1-47.1-43.7-111.8-80.6-192.6-80.6zM144 256a144 144 0 1 1 288 0 144 144 0 1 1 -288 0zm144-64c0 35.3-28.7 64-64 64-11.5 0-22.3-3-31.7-8.4-1 10.9-.1 22.1 2.9 33.2 13.7 51.2 66.4 81.6 117.6 67.9s81.6-66.4 67.9-117.6c-12.2-45.7-55.5-74.8-101.1-70.8 5.3 9.3 8.4 20.1 8.4 31.7z" />
        </svg>`;
    }
}

const handlePasswordChange = () => {
    const hasPassword = elements.newPasswordInput.value.length > 0;

    elements.changePasswordBtn.disabled = !hasPassword;

    if (hasPassword && !elements.changePasswordBtn.classList.contains('animate-pulse-custom')) {
        elements.changePasswordBtn.classList.toggle('animate-pulse-custom');
    }
};

const getdata = async () => {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/files', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = res.ok ? await res.json() : null;

        if (data?.file_name && data?.uploaded_date && data?.success) {
            elements.deleteBtn.disabled = false;
            elements.downloadBtn.disabled = false;
            currentDateFile = data.uploaded_date.split('-');
            elements.fileStatus.innerHTML = fileTemplates.hasFile(data.file_name, `${currentDateFile[2]}-${currentDateFile[1]}-${currentDateFile[0]}`);
        } else {
            elements.fileStatus.innerHTML = fileTemplates.empty;
            elements.deleteBtn.disabled = true;
            elements.downloadBtn.disabled = true;
        }
    } catch (error) {
        elements.fileStatus.innerHTML = fileTemplates.empty;
        elements.deleteBtn.disabled = true;
        elements.downloadBtn.disabled = true;
    }
};

const removeEventListeners = () => {
    const oldExcelFile = elements.excelFile;
    const newExcelFile = oldExcelFile.cloneNode(true);
    oldExcelFile.parentNode.replaceChild(newExcelFile, oldExcelFile);
    elements.excelFile = newExcelFile;

    const oldDropZone = elements.dropZone;
    const newDropZone = oldDropZone.cloneNode(true);
    oldDropZone.parentNode.replaceChild(newDropZone, oldDropZone);
    elements.dropZone = newDropZone;
};

const initializeDashboard = () => {

    removeEventListeners();

    elements.fileStatus.innerHTML = fileTemplates.loading;

    getdata();

    elements.excelFile.addEventListener('change', handleFileChange);

    elements.dropZone.addEventListener('click', (e) => {
        if (e.target.closest('#deleteSelectedFileBtn') || e.target.closest('#changeFileBtn')) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        elements.excelFile.click();
    });

    elements.showPasswordBtn.addEventListener("click", handleShowPass);

    elements.newPasswordInput.type = 'password';

    elements.newPasswordInput.addEventListener("input", handlePasswordChange);

    elements.changePasswordBtn.disabled = true;

    // Form submission
    elements.uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isUploading) return;

        toggleUploadState(true);

        try {
            const formData = new FormData(elements.uploadForm);
            const token = localStorage.getItem('token');
            const res = await fetch('/api/v1/upload-excel', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (res.ok) {
                showSuccess('¡Archivo Subido!', 'Tu archivo se ha guardado correctamente');
                resetDropZone();
                elements.uploadBtn.disabled = true;
                await getdata();
            } else {
                throw new Error('Error al subir el archivo');
            }
        } catch (error) {
            console.log(error);
            showSuccess('Error', 'No se pudo subir el archivo');
        } finally {
            toggleUploadState(false);
        }
    });
};

window.clearSelectedFile = () => {
    resetDropZone();
    elements.uploadBtn.disabled = true;
};

window.downloadFile = async () => {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/get-excel', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (res.ok) {
            showSuccess('¡Descargando!', 'Tu archivo se está descargando');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Listado_DivisionRepuestos(${currentDateFile[2]}-${currentDateFile[1]}-${currentDateFile[0]}).xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } else {
            showSuccess('Error', 'No se pudo descargar el archivo');
            throw new Error('Archivo no encontrado');
        }
    } catch (error) {
        showSuccess('Error', 'No puede realizar esta acción');
    }
};

window.deleteFile = async () => {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/delete-excel', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await res.json();

        if (res.ok && data?.success) {
            showSuccess('¡Eliminado!', 'El archivo ha sido eliminado correctamente');
            await getdata();
        } else {
            throw new Error(data?.error || 'Error al eliminar el archivo');
        }
    } catch (error) {
        showSuccess('Error', error);
    }
};

window.logout = () => {
    localStorage.removeItem('token');
    isLoggedIn = false;
    elements.dashboard.classList.remove('show');
    elements.dashboard.style.display = 'none';
    elements.loginScreen.style.display = 'flex';
    elements.loginScreen.classList.remove('hide');
    elements.loginPassword.value = '';
    elements.loginError.classList.add('hidden');
    resetDropZone();
};

// Event listeners
elements.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (elements.loginBtn.disabled) return;

    const password = elements.loginPassword.value.trim();
    if (!password) return;

    toggleLoginState(true);
    elements.loginError.classList.add('hidden');

    await login(password);
    toggleLoginState(false);
});

// Check if already logged in
window.addEventListener('load', async () => {
    await verifyToken();
});

// Password management functions
const showNewPasswordSection = () => {
    elements.newPasswordSection.classList.remove('hidden');
    elements.uploadSection.classList.add('hidden');
};

const hideNewPasswordSection = () => {
    elements.newPasswordSection.classList.add('hidden');
    elements.uploadSection.classList.remove('hidden');
}

window.changePassword = async (e) => {
    try {
        // Prevenir el comportamiento por defecto sin importar cómo se llame
        if (e && e.preventDefault) {
            e.preventDefault();
        }

        const token = localStorage.getItem('token');
        if (!token) {
            showSuccess('Error', 'Sesión expirada');
            return;
        }

        const newPassword = elements.newPasswordInput.value.trim();

        if (!newPassword) {
            showSuccess('Error', 'La contraseña no puede estar vacía');
            elements.newPasswordInput.focus();
            return;
        }

        // Validaciones adicionales de contraseña
        if (newPassword.length < 4) {
            showSuccess('Error', 'La contraseña debe tener al menos 4 caracteres');
            elements.newPasswordInput.focus();
            return;
        }

        // Deshabilitar botón durante la petición
        const originalText = elements.changePasswordBtn.textContent;
        elements.changePasswordBtn.disabled = true;
        elements.changePasswordBtn.textContent = 'Cambiando...';

        const res = await fetch('/api/v1/new-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ newPassword })
        });

        if (res.ok) {
            showSuccess('¡Contraseña Cambiada!', 'Tu contraseña se ha cambiado correctamente');
            elements.newPasswordForm.reset();
            elements.newPasswordInput.value = '';
            elements.changePasswordBtn.disabled = true;
            elements.changePasswordBtn.classList.remove('animate-pulse-custom');
        } else {
            const errorData = await res.json();
            throw new Error(errorData?.error || 'Error al cambiar la contraseña');
        }
    } catch (error) {
        console.error('Error changing password:', error);
        showSuccess('Error', error.message || 'No se pudo cambiar la contraseña');
    } finally {
        // Restaurar botón
        elements.changePasswordBtn.textContent = 'Cambiar Contraseña';
        // Solo habilitar si hay texto en el input
        elements.changePasswordBtn.disabled = !elements.newPasswordInput.value.trim();
    }
};

