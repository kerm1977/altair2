        // Función autoejecutable: No espera a DOMContentLoaded para funcionar bien en cargas dinámicas.
        (function inicializarFormulario() {
            // Validamos que el DOM del formulario exista antes de aplicar listeners
            const formRegistro = document.getElementById('form-registro');
            if (!formRegistro) return;

            // --- 1. LÓGICA DE IMAGEN Y EDITOR ---
            const avatarInput = document.getElementById('avatarInput');
            const avatarPreview = document.getElementById('avatarPreview');
            const avatarPlaceholder = document.getElementById('avatarPlaceholder');
            const avatarControls = document.getElementById('avatarControls');
            const zoomRange = document.getElementById('zoomRange');
            const xRange = document.getElementById('xRange');

            if(avatarInput) {
                avatarInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            avatarPreview.src = event.target.result;
                            avatarPreview.style.display = 'block';
                            avatarPlaceholder.style.display = 'none';
                            avatarControls.classList.remove('d-none');
                            // Reset controles
                            zoomRange.value = 1;
                            xRange.value = 0;
                            updateAvatarTransform();
                        }
                        reader.readAsDataURL(file);
                    }
                });

                function updateAvatarTransform() {
                    const scale = zoomRange.value;
                    const translateX = xRange.value;
                    avatarPreview.style.transform = `scale(${scale}) translateX(${translateX}px)`;
                }

                zoomRange.addEventListener('input', updateAvatarTransform);
                xRange.addEventListener('input', updateAvatarTransform);
            }

            // --- 2. FORMATEADORES DE TEXTO (Title Case) ---
            function toTitleCase(str) {
                return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            }

            // Nombre: Solo un espacio, sin números ni especiales
            const inputNombre = document.getElementById('regNombre');
            if(inputNombre) {
                inputNombre.addEventListener('input', (e) => {
                    let val = e.target.value;
                    val = val.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, ''); // Solo letras y espacios
                    const parts = val.split(' ');
                    if (parts.length > 2) val = parts[0] + ' ' + parts.slice(1).join(''); // Máx 1 espacio
                    e.target.value = toTitleCase(val);
                });
            }

            // Apellidos y Contacto Emergencia: Sin espacios, sin números ni especiales
            const apellidosInputs = ['regApellido1', 'regApellido2', 'emgNombre'];
            apellidosInputs.forEach(id => {
                const input = document.getElementById(id);
                if(!input) return;
                input.addEventListener('input', (e) => {
                    let val = e.target.value;
                    if(id === 'emgNombre'){
                        val = val.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '');
                        val = val.replace(/\s{2,}/g, ' '); // Permitir espacios pero no dobles
                    } else {
                        val = val.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, ''); // Sin espacios estricto
                    }
                    e.target.value = toTitleCase(val);
                });
            });

            // Email: Lowercase
            const inputEmail = document.getElementById('regEmail');
            if(inputEmail) {
                inputEmail.addEventListener('input', (e) => {
                    e.target.value = e.target.value.toLowerCase();
                });
            }

            // --- 3. LÓGICA DE TELÉFONOS (8 números exactos) ---
            const telInputs = ['regTelefono', 'emgTelefono'];
            telInputs.forEach(id => {
                const input = document.getElementById(id);
                if(!input) return;
                input.addEventListener('input', (e) => {
                    let val = e.target.value.replace(/\D/g, ''); // Solo números
                    if (val.length > 8) val = val.substring(0, 8); // No más de 8
                    e.target.value = val;
                    
                    if(id === 'regTelefono'){
                        const errorMsg = document.getElementById('telError');
                        if(val.length > 0 && val.length < 8) {
                            errorMsg.classList.remove('d-none');
                            input.classList.add('is-invalid');
                        } else {
                            errorMsg.classList.add('d-none');
                            input.classList.remove('is-invalid');
                        }
                    }
                });
            });

            // --- 4. GENERAR PIN ---
            function generatePIN() {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let pin = '';
                for (let i = 0; i < 8; i++) {
                    pin += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return pin;
            }
            const regPinInput = document.getElementById('regPin');
            if(regPinInput) regPinInput.value = generatePIN();

            // --- 5. FECHA DE NACIMIENTO Y EDAD ---
            const selectDia = document.getElementById('dobDia');
            const selectMes = document.getElementById('dobMes');
            const selectAnio = document.getElementById('dobAnio');
            const edadText = document.getElementById('edadText');
            
            if(selectDia && selectMes && selectAnio) {
                const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                const hoy = new Date();
                const anioActual = hoy.getFullYear();
                const anioMax = anioActual - 15; // Mínimo 15 años
                const anioMin = 1930;

                for (let y = anioMax; y >= anioMin; y--) {
                    const option = document.createElement('option');
                    option.value = y; option.textContent = y;
                    selectAnio.appendChild(option);
                }

                meses.forEach((mes, index) => {
                    const option = document.createElement('option');
                    option.value = index; option.textContent = mes;
                    selectMes.appendChild(option);
                });

                function actualizarDias() {
                    const anio = parseInt(selectAnio.value);
                    const mes = parseInt(selectMes.value);
                    const diasEnMes = new Date(anio, mes + 1, 0).getDate();
                    
                    const diaPrevio = selectDia.value;
                    selectDia.innerHTML = '';
                    
                    for (let d = 1; d <= diasEnMes; d++) {
                        const option = document.createElement('option');
                        option.value = d; option.textContent = d;
                        selectDia.appendChild(option);
                    }
                    if (diaPrevio && diaPrevio <= diasEnMes) selectDia.value = diaPrevio;
                }

                function calcularEdad() {
                    const anio = parseInt(selectAnio.value);
                    const mes = parseInt(selectMes.value);
                    const dia = parseInt(selectDia.value);
                    if(!anio || isNaN(mes) || !dia) return;

                    const fechaNac = new Date(anio, mes, dia);
                    let edad = hoy.getFullYear() - fechaNac.getFullYear();
                    const m = hoy.getMonth() - fechaNac.getMonth();
                    
                    if (m < 0 || (m === 0 && hoy.getDate() < fechaNac.getDate())) edad--;
                    edadText.textContent = edad;
                }

                selectAnio.addEventListener('change', () => { actualizarDias(); calcularEdad(); });
                selectMes.addEventListener('change', () => { actualizarDias(); calcularEdad(); });
                selectDia.addEventListener('change', calcularEdad);

                actualizarDias();
                calcularEdad();
            }
        })();

        // --- 6. VISIBILIDAD DE CONTRASEÑAS (Global para llamar por onclick) ---
        function togglePassword(inputId, iconId) {
            const inputPass = document.getElementById(inputId);
            const iconoOjo = document.getElementById(iconId);
            
            if (!inputPass || !iconoOjo) return;

            if (inputPass.type === 'password') {
                inputPass.type = 'text';
                iconoOjo.className = 'bi bi-eye-slash-fill fs-5 text-primary';
            } else {
                inputPass.type = 'password';
                iconoOjo.className = 'bi bi-eye-fill fs-5 text-secondary';
            }
        }

        // --- 7. PROCESAR REGISTRO ---
        async function procesarRegistro(event) {
            event.preventDefault();
            
            const tel = document.getElementById('regTelefono').value;
            const emTel = document.getElementById('emgTelefono').value;
            if (tel.length !== 8) return alert('El teléfono principal debe tener exactamente 8 números.');
            if (emTel && emTel.length !== 8) return alert('El teléfono de emergencia debe tener exactamente 8 números.');
            
            const pw1 = document.getElementById('regPassword').value;
            const pw2 = document.getElementById('regConfirmPassword').value;
            if(pw1 !== pw2) return alert('Las contraseñas no coinciden.');

            // Lógica visual del botón
            const btn = document.getElementById('btnRegistro');
            const btnText = document.getElementById('btnRegText');
            const btnSpinner = document.getElementById('btnRegSpinner');

            btn.disabled = true;
            btnText.textContent = 'Procesando...';
            btnSpinner.classList.remove('d-none');

            try {
                // Simulación de carga
                await new Promise(resolve => setTimeout(resolve, 1500));
                alert('¡Registro validado exitosamente!');
                window.location.hash = 'login'; // Redirección hipotética
            } catch (error) {
                alert("Error: " + error.message);
            } finally {
                btn.disabled = false;
                btnText.textContent = 'Registrarse';
                btnSpinner.classList.add('d-none');
            }
        }