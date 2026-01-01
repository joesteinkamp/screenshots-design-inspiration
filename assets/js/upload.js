// Firebase Storage functions
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-storage.js";

const { useState, useEffect, useRef } = window.preact;
const html = window.html;
const { render } = window.preact;

const UploadApp = () => {
    const [files, setFiles] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [productName, setProductName] = useState('');
    const [filteredProducts, setFilteredProducts] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [uploadComplete, setUploadComplete] = useState(false);
    const [error, setError] = useState('');

    const existingProducts = window.existingProducts || [];
    const fileInputRef = useRef(null);

    // Filter products for autocomplete
    useEffect(() => {
        if (productName.length > 0) {
            const lower = productName.toLowerCase();
            const filtered = existingProducts.filter(p => 
                p.name.toLowerCase().includes(lower)
            ).slice(0, 5); // Limit to 5 suggestions
            setFilteredProducts(filtered);
        } else {
            setFilteredProducts([]);
        }
    }, [productName]);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFiles = Array.from(e.dataTransfer.files);
        processFiles(droppedFiles);
    };

    const handleFileSelect = (e) => {
        const selectedFiles = Array.from(e.target.files);
        processFiles(selectedFiles);
    };

    const processFiles = (newFiles) => {
        // Validation
        const validFiles = newFiles.filter(file => 
            file.type.startsWith('image/') || file.type.startsWith('video/')
        );

        if (validFiles.length !== newFiles.length) {
            setError('Some files were rejected. Only images and videos are allowed.');
        } else {
            setError('');
        }

        if (files.length + validFiles.length > 100) {
            setError('Maximum 100 files allowed.');
            return;
        }

        setFiles(prev => [...prev, ...validFiles]);
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleNext = () => {
        if (files.length === 0) {
            setError('Please select at least one file.');
            return;
        }
        setShowModal(true);
    };

    const selectProduct = (name) => {
        setProductName(name);
        setFilteredProducts([]);
    };

    const handleUpload = async () => {
        if (!productName) {
            setError('Please enter a product name.');
            return;
        }

        setUploading(true);
        setProgress(0);
        setError('');

        const storage = window.firebaseStorage;
        if (!storage) {
            setError("Firebase Storage not initialized.");
            setUploading(false);
            return;
        }

        const totalBytes = files.reduce((acc, file) => acc + file.size, 0);
        let totalBytesTransferred = 0;
        
        // Track individual file progress to calculate global progress
        const fileProgress = new Array(files.length).fill(0);

        const uploadPromises = files.map((file, index) => {
            // Include product name in the path: e.g. "Airbnb/screenshot.png"
            // Sanitize product name to avoid path issues if needed, but Firebase handles spaces usually.
            const path = `${productName}/${file.name}`;
            const storageRef = ref(storage, path);
            const uploadTask = uploadBytesResumable(storageRef, file);

            return new Promise((resolve, reject) => {
                uploadTask.on('state_changed', 
                    (snapshot) => {
                        // Update progress
                        fileProgress[index] = snapshot.bytesTransferred;
                        const globalTransferred = fileProgress.reduce((a, b) => a + b, 0);
                        const percent = Math.round((globalTransferred / totalBytes) * 100);
                        setProgress(percent);
                    }, 
                    (error) => {
                        console.error("Upload error:", error);
                        reject(error);
                    }, 
                    () => {
                        // Upload completed successfully
                        resolve();
                    }
                );
            });
        });

        try {
            await Promise.all(uploadPromises);
            setUploading(false);
            setUploadComplete(true);
        } catch (err) {
            console.error(err);
            setError(`Upload failed: ${err.message}`);
            setUploading(false);
        }
    };

    // Render Logic
    if (uploadComplete) {
        return html`
            <div class="upload-success">
                <div class="success-icon">✅</div>
                <h2>Upload Complete!</h2>
                <p>Successfully uploaded ${files.length} files to <strong>${productName}</strong>.</p>
                <button class="btn-primary" onClick=${() => window.location.reload()}>Upload More</button>
            </div>
        `;
    }

    return html`
        <div class="upload-wrapper">
            ${error && html`<div class="error-banner">${error}</div>`}
            
            <div 
                class="dropzone ${isDragging ? 'dragging' : ''} ${files.length > 0 ? 'has-files' : ''}"
                onDragOver=${handleDragOver}
                onDragLeave=${handleDragLeave}
                onDrop=${handleDrop}
            >
                ${files.length === 0 ? html`
                    <div class="dropzone-content">
                        <div class="upload-icon">📁</div>
                        <h3>Drag & Drop files here</h3>
                        <p>or</p>
                        <button class="btn-secondary" onClick=${() => fileInputRef.current.click()}>Browse Files</button>
                        <p class="limit-text">Max 100 files (Images & Videos only)</p>
                    </div>
                ` : html`
                    <div class="file-grid">
                        ${files.map((file, i) => html`
                            <div class="file-item ${file.type.startsWith('video/') ? 'is-video' : ''}">
                                ${file.type.startsWith('video/') ? html`
                                    <video src=${URL.createObjectURL(file)} class="file-thumb" muted playsinline onMouseOver=${e => e.target.play()} onMouseOut=${e => e.target.pause()}></video>
                                ` : html`
                                    ${file.type.startsWith('image/') ? html`
                                        <img src=${URL.createObjectURL(file)} class="file-thumb" />
                                    ` : html`
                                        <span class="file-obj">📄</span>
                                    `}
                                `}
                                <span class="file-name">${file.name}</span>
                                <button class="file-remove" onClick=${() => removeFile(i)}>×</button>
                            </div>
                        `)}
                        <div class="add-more-card" onClick=${() => fileInputRef.current.click()}>
                            <span>+ Add More</span>
                        </div>
                    </div>
                    <div class="action-bar">
                        <p>${files.length} files selected</p>
                        <button class="btn-primary" onClick=${handleNext}>Next →</button>
                    </div>
                `}
                <input 
                    type="file" 
                    ref=${fileInputRef} 
                    style="display: none" 
                    multiple 
                    accept="image/*,video/*"
                    onChange=${handleFileSelect}
                />
            </div>

            ${showModal && html`
                <div class="modal-overlay">
                    <div class="modal">
                        <h2>Details</h2>
                        <div class="form-group">
                            <label>Product Name</label>
                            <input 
                                type="text" 
                                value=${productName}
                                onInput=${(e) => setProductName(e.target.value)}
                                placeholder="e.g. Airbnb, Spotify..."
                            />
                            ${filteredProducts.length > 0 && html`
                                <ul class="autocomplete-list">
                                    ${filteredProducts.map(p => html`
                                        <li onClick=${() => selectProduct(p.name)}>
                                            <span class="prod-name">${p.name}</span>
                                            <span class="prod-cat">${p.category}</span>
                                        </li>
                                    `)}
                                </ul>
                            `}
                        </div>
                        
                        ${uploading ? html`
                            <div class="progress-container">
                                <div class="progress-bar" style="width: ${progress}%"></div>
                                <span>Uploading... ${progress}%</span>
                            </div>
                        ` : html`
                             <div class="modal-actions">
                                <button class="btn-secondary" onClick=${() => setShowModal(false)}>Cancel</button>
                                <button class="btn-primary" onClick=${handleUpload}>Upload Files</button>
                            </div>
                        `}
                    </div>
                </div>
            `}
        </div>
    `;
};

render(html`<${UploadApp} />`, document.getElementById('upload-app'));
