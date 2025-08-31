// Global variables
const vscode = acquireVsCodeApi();
let isWaitingForResponse = false;
let contextData = {
    currentFile: null,
    currentSelection: null,
    additionalFiles: [],
    customCode: [],
    activeFile: null
};

// Logging utility
function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [WebView] ${message}`;
    
    switch (level) {
        case 'error':
            console.error(logMessage);
            break;
        case 'warn':
            console.warn(logMessage);
            break;
        default:
            console.log(logMessage);
    }
}

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    log('WebView loaded, initializing...');
    initializeEventListeners();
    setupDragAndDrop();
    setupResizeHandler();
    restoreState();
    requestActiveFileInfo();
    
    // Initialize mode display
    updateModeDisplay();
    updateModeBanner();
    updateInputHelp();
    
    log('WebView initialization complete');
});

// Initialize all event listeners
function initializeEventListeners() {
    log('Setting up event listeners');
    
    // Send button and message input
    const sendButton = document.getElementById('send-button');
    const messageInput = document.getElementById('message-input');
    
    if (sendButton) {
        sendButton.addEventListener('click', sendMessage);
        log('Send button listener attached');
    }
    
    if (messageInput) {
        messageInput.addEventListener('keydown', handleInputKeydown);
        messageInput.addEventListener('input', handleInputChange);
        log('Message input listeners attached');
    }
    
    // New chat button
    const newChatButton = document.getElementById('new-chat');
    if (newChatButton) {
        newChatButton.addEventListener('click', startNewChat);
        log('New chat button listener attached');
    }
    
    // File attach button with enhanced menu
    const attachButton = document.getElementById('attach-file');
    if (attachButton) {
        attachButton.addEventListener('click', showContextMenu);
        log('Attach button listener attached');
    }
    
    // Clear context button
    const clearContextButton = document.getElementById('clear-context');
    if (clearContextButton) {
        clearContextButton.addEventListener('click', clearAllContext);
        log('Clear context button listener attached');
    }
    
    // Active file actions
    const includeActiveFileBtn = document.getElementById('include-active-file');
    const dismissActiveFileBtn = document.getElementById('dismiss-active-file');
    
    if (includeActiveFileBtn) {
        includeActiveFileBtn.addEventListener('click', includeActiveFile);
        log('Include active file button listener attached');
    }
    
    if (dismissActiveFileBtn) {
        dismissActiveFileBtn.addEventListener('click', dismissActiveFile);
        log('Dismiss active file button listener attached');
    }
    
    // Mode selection dropdown
    const currentMode = document.getElementById('current-mode');
    const modeDropdown = document.getElementById('mode-dropdown');
    const modeOptions = document.querySelectorAll('.mode-option');
    
    if (currentMode) {
        currentMode.addEventListener('click', toggleModeDropdown);
        log('Mode selection dropdown listener attached');
    }
    
    if (modeOptions.length > 0) {
        modeOptions.forEach(option => {
            option.addEventListener('click', handleModeSelection);
        });
        log('Mode option listeners attached');
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (modeDropdown && !currentMode.contains(e.target) && !modeDropdown.contains(e.target)) {
            modeDropdown.style.display = 'none';
        }
    });
    
    // Context menu handling
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('click', handleContextMenuClick);
    
    log('All event listeners set up successfully');
}

// Request active file info from VS Code
function requestActiveFileInfo() {
    log('Requesting active file info from VS Code');
    vscode.postMessage({ command: 'getActiveFile' });
}

// Setup drag and drop functionality
function setupDragAndDrop() {
    log('Setting up drag and drop functionality');
    
    const container = document.querySelector('.container');
    const dropZone = document.getElementById('drop-zone');
    let dragCounter = 0;
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        container.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        container.addEventListener(eventName, handleDragEnter, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        container.addEventListener(eventName, handleDragLeave, false);
    });
    
    // Handle dropped files
    container.addEventListener('drop', handleDrop, false);
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function handleDragEnter(e) {
        dragCounter++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            dropZone.classList.add('active');
            log('Drag enter detected, showing drop zone');
        }
    }
    
    function handleDragLeave(e) {
        dragCounter--;
        if (dragCounter === 0) {
            dropZone.classList.remove('active');
            log('Drag leave detected, hiding drop zone');
        }
    }
    
    function handleDrop(e) {
        dragCounter = 0;
        dropZone.classList.remove('active');
        log('Drop event detected');
        
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            log(`Files dropped: ${files.length}`);
            handleDroppedFiles([...files]);
        }
        
        // Also handle VS Code specific drag data
        const vscodeData = dt.getData('text/plain');
        if (vscodeData) {
            log('VS Code drag data detected');
            handleVSCodeDragData(vscodeData);
        }
    }
    
    log('Drag and drop setup complete');
}

// Handle dropped files
function handleDroppedFiles(files) {
    log(`Processing ${files.length} dropped files`);
    
    files.forEach((file, index) => {
        log(`Processing file ${index + 1}: ${file.name} (${file.type})`);
        
        if (file.type.startsWith('text/') || isCodeFile(file.name)) {
            const reader = new FileReader();
            reader.onload = function(e) {
                log(`File content loaded for: ${file.name}`);
                addFileContext({
                    name: file.name,
                    content: e.target.result,
                    type: 'dropped-file',
                    path: file.name
                });
            };
            reader.readAsText(file);
        } else {
            log(`Unsupported file type: ${file.name}`, 'warn');
            showToast(`File type not supported: ${file.name}`, 'warning');
        }
    });
}

// Handle VS Code drag data
function handleVSCodeDragData(data) {
    log(`Processing VS Code drag data: ${data.substring(0, 100)}...`);
    
    try {
        const parsed = JSON.parse(data);
        if (parsed.filePath) {
            log(`VS Code file path detected: ${parsed.filePath}`);
            vscode.postMessage({ 
                command: 'addDroppedFile', 
                filePath: parsed.filePath 
            });
        }
    } catch (e) {
        // Fallback for simple text drag
        if (data.includes('/') || data.includes('\\')) {
            log(`File path detected in drag data: ${data}`);
            vscode.postMessage({ 
                command: 'addDroppedFile', 
                filePath: data 
            });
        }
    }
}

// Check if file is a code file
function isCodeFile(filename) {
    const codeExtensions = [
        '.js', '.ts', '.jsx', '.tsx', '.vue', '.py', '.java', '.c', '.cpp', 
        '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', 
        '.html', '.css', '.scss', '.sass', '.less', '.json', '.xml', 
        '.yaml', '.yml', '.md', '.txt', '.sql', '.sh', '.bat', '.ps1'
    ];
    const isCode = codeExtensions.some(ext => filename.toLowerCase().endsWith(ext));
    log(`File extension check for ${filename}: ${isCode}`);
    return isCode;
}

// Show context menu
function showContextMenu(e) {
    log('Showing context menu');
    e.preventDefault();
    const contextMenu = document.getElementById('context-menu');
    const rect = e.target.getBoundingClientRect();
    
    contextMenu.style.display = 'block';
    contextMenu.style.left = rect.left + 'px';
    contextMenu.style.top = (rect.bottom + 5) + 'px';
    
    // Adjust position if menu goes off screen
    const menuRect = contextMenu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
        contextMenu.style.left = (window.innerWidth - menuRect.width - 10) + 'px';
    }
    if (menuRect.bottom > window.innerHeight) {
        contextMenu.style.top = (rect.top - menuRect.height - 5) + 'px';
    }
    
    log('Context menu displayed');
}

// Hide context menu
function hideContextMenu(e) {
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu && !contextMenu.contains(e.target)) {
        contextMenu.style.display = 'none';
    }
}

// Handle context menu clicks
function handleContextMenuClick(e) {
    const menuItem = e.target.closest('.context-menu-item');
    if (menuItem) {
        const action = menuItem.dataset.action;
        const contextMenu = document.getElementById('context-menu');
        contextMenu.style.display = 'none';
        
        log(`Context menu action selected: ${action}`);
        
        switch (action) {
            case 'include-file':
                vscode.postMessage({ command: 'selectFile' });
                break;
            case 'include-selection':
                vscode.postMessage({ command: 'includeSelection' });
                break;
            case 'add-custom-code':
                vscode.postMessage({ command: 'addCode' });
                break;
        }
    }
}

// Handle input keydown events
function handleInputKeydown(event) {
    if (event.key === 'Enter') {
        if (event.shiftKey) {
            log('Shift+Enter detected, allowing new line');
            return; // Allow new line
        } else {
            log('Enter detected, sending message');
            event.preventDefault();
            sendMessage();
        }
    }
}

// Handle input changes for auto-resize
function handleInputChange() {
    const input = document.getElementById('message-input');
    if (input) {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }
}

// Include active file
function includeActiveFile() {
    log('Including active file in context');
    
    if (contextData.activeFile) {
        addFileContext({
            name: contextData.activeFile.name,
            content: contextData.activeFile.content,
            type: 'active-file',
            path: contextData.activeFile.path
        });
        dismissActiveFile();
    } else {
        log('No active file available to include', 'warn');
    }
}

// Dismiss active file banner
function dismissActiveFile() {
    log('Dismissing active file banner');
    const banner = document.getElementById('active-file-banner');
    if (banner) {
        banner.style.display = 'none';
    }
}

// Add file context
function addFileContext(fileData) {
    log(`Adding file context: ${fileData.name} (${fileData.type})`);
    
    // Avoid duplicates
    const exists = contextData.additionalFiles.some(f => f.path === fileData.path);
    if (exists) {
        log('File already exists in context', 'warn');
        showToast('File already added to context', 'warning');
        return;
    }
    
    contextData.additionalFiles.push(fileData);
    updateContextDisplay();
    showToast(`Added ${fileData.name} to context`, 'success');
    log(`File context added successfully: ${fileData.name}`);
}

// Clear all context
function clearAllContext() {
    log('Clearing all context');
    
    const itemCount = contextData.additionalFiles.length + 
                     contextData.customCode.length + 
                     (contextData.currentSelection ? 1 : 0);
    
    contextData.additionalFiles = [];
    contextData.customCode = [];
    contextData.currentSelection = null;
    updateContextDisplay();
    showToast('Cleared all context', 'info');
    log(`Cleared ${itemCount} context items`);
}

// Update context display
function updateContextDisplay() {
    log('Updating context display');
    updateContextIndicators();
    updateContextPills();
    saveState();
}

// Update context indicators in header
function updateContextIndicators() {
    const indicators = document.getElementById('context-indicators');
    if (!indicators) return;
    
    indicators.innerHTML = '';
    
    const totalItems = contextData.additionalFiles.length + 
                      contextData.customCode.length + 
                      (contextData.currentSelection ? 1 : 0);
    
    log(`Updating context indicators: ${totalItems} items`);
    
    if (totalItems > 0) {
        const badge = document.createElement('div');
        badge.className = 'context-badge';
        badge.innerHTML = `
            <span class="badge-icon">🔗</span>
            <span>${totalItems} context item${totalItems > 1 ? 's' : ''}</span>
        `;
        indicators.appendChild(badge);
    }
}

// Update context pills in input area
function updateContextPills() {
    const pills = document.getElementById('context-pills');
    if (!pills) return;
    
    pills.innerHTML = '';
    
    let pillCount = 0;
    
    // Add file pills
    contextData.additionalFiles.forEach((file, index) => {
        const pill = createContextPill(
            file.name,
            '📄',
            () => removeFileContext(index)
        );
        pills.appendChild(pill);
        pillCount++;
    });
    
    // Add custom code pills
    contextData.customCode.forEach((code, index) => {
        const pill = createContextPill(
            `Code snippet ${index + 1}`,
            '✏️',
            () => removeCustomCode(index)
        );
        pills.appendChild(pill);
        pillCount++;
    });
    
    // Add selection pill
    if (contextData.currentSelection) {
        const pill = createContextPill(
            'Selected code',
            '✂️',
            () => removeSelection()
        );
        pills.appendChild(pill);
        pillCount++;
    }
    
    log(`Updated context pills: ${pillCount} pills displayed`);
}

// Create context pill
function createContextPill(text, icon, onRemove) {
    const pill = document.createElement('div');
    pill.className = 'context-pill';
    
    pill.innerHTML = `
        <span class="pill-icon">${icon}</span>
        <span class="pill-text">${escapeHtml(text)}</span>
        <button class="remove-pill" title="Remove">✕</button>
    `;
    
    pill.querySelector('.remove-pill').addEventListener('click', onRemove);
    
    return pill;
}

// Remove file context
function removeFileContext(index) {
    log(`Removing file context at index: ${index}`);
    contextData.additionalFiles.splice(index, 1);
    updateContextDisplay();
    showToast('Removed file from context', 'info');
}

// Remove custom code
function removeCustomCode(index) {
    log(`Removing custom code at index: ${index}`);
    contextData.customCode.splice(index, 1);
    updateContextDisplay();
    showToast('Removed code from context', 'info');
}

// Remove selection
function removeSelection() {
    log('Removing selection from context');
    contextData.currentSelection = null;
    updateContextDisplay();
    showToast('Removed selection from context', 'info');
}

// Mode selection functionality
let currentMode = 'chat';

function toggleModeDropdown() {
    log('Toggling mode dropdown');
    const dropdown = document.getElementById('mode-dropdown');
    if (dropdown) {
        const isVisible = dropdown.style.display === 'block';
        dropdown.style.display = isVisible ? 'none' : 'block';
        log(`Mode dropdown ${isVisible ? 'hidden' : 'shown'}`);
    }
}

function handleModeSelection(e) {
    const mode = e.currentTarget.dataset.mode;
    log(`Mode selection: ${mode}`);
    
    if (mode && mode !== currentMode) {
        currentMode = mode;
        updateModeDisplay();
        updateModeBanner();
        updateInputHelp();
        
        // Notify VS Code about mode change
        vscode.postMessage({ 
            command: 'modeChanged', 
            mode: mode 
        });
        
        showToast(`Switched to ${mode === 'chat' ? 'Chat' : 'Smart Agent'} mode`, 'success');
        log(`Mode changed to: ${mode}`);
    }
    
    // Close dropdown
    const dropdown = document.getElementById('mode-dropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

function updateModeDisplay() {
    const modeIcon = document.getElementById('mode-icon');
    const modeText = document.getElementById('mode-text');
    
    if (modeIcon && modeText) {
        if (currentMode === 'chat') {
            modeIcon.textContent = '💬';
            modeText.textContent = 'Chat Mode';
        } else {
            modeIcon.textContent = '🤖';
            modeText.textContent = 'Smart Agent Mode';
        }
        log(`Mode display updated to: ${currentMode}`);
    }
}

function updateModeBanner() {
    const bannerIcon = document.getElementById('mode-banner-icon');
    const bannerText = document.getElementById('mode-banner-text');
    
    if (bannerIcon && bannerText) {
        if (currentMode === 'chat') {
            bannerIcon.textContent = '💬';
            bannerText.textContent = 'Chat mode: Ask questions about your code, get explanations, and discuss programming concepts.';
        } else {
            bannerIcon.textContent = '🤖';
            bannerText.textContent = 'Smart Agent mode: Execute intelligent file operations, apply changes, and modify your codebase.';
        }
        log(`Mode banner updated to: ${currentMode}`);
    }
}

function updateInputHelp() {
    const chatHelp = document.getElementById('chat-help');
    const smartHelp = document.getElementById('smart-help');
    
    if (chatHelp && smartHelp) {
        if (currentMode === 'chat') {
            chatHelp.style.display = 'block';
            smartHelp.style.display = 'none';
        } else {
            chatHelp.style.display = 'none';
            smartHelp.style.display = 'block';
        }
        log(`Input help updated for mode: ${currentMode}`);
    }
}

// Send message function
function sendMessage() {
    if (isWaitingForResponse) {
        log('Message send blocked - already waiting for response');
        return;
    }
    
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    log(`Sending message - Length: ${message.length}`);
    
    if (message) {
        isWaitingForResponse = true;
        updateSendButton();
        showTypingIndicator();
        
        addUserMessage(message);
        input.value = '';
        input.style.height = 'auto';
        
        log('Posting message to VS Code with context');
        vscode.postMessage({ 
            command: 'sendMessage', 
            content: message,
            mode: currentMode,
            context: {
                ...contextData,
                additionalFiles: contextData.additionalFiles || [],
                customCode: contextData.customCode || []
            }
        });
    } else {
        log('Empty message, not sending');
    }
}

// Add user message to chat
function addUserMessage(content) {
    log(`Adding user message to chat - Length: ${content.length}`);
    
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;
    
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Add assistant message to chat
function addAssistantMessage(content) {
    log(`Adding assistant message to chat - Length: ${content.length}`);
    
    const chatContainer = document.getElementById('chat-container');
    if (!chatContainer) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = formatMessageContent(content);
    
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Format message content
function formatMessageContent(content) {
    // Escape HTML first
    let formatted = escapeHtml(content);
    
    // Handle code blocks with language support
    formatted = formatted.replace(/``````/g, function(match, lang, code) {
        const langClass = lang ? ` language-${lang}` : '';
        const escapedCode = code ? code.trim() : '';
        return `<div class="code-block${langClass}"><pre><code>${escapedCode}</code></pre></div>`;
    });
    
    // Handle inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Handle line breaks
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Handle bold text
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Handle italic text
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    return formatted;
}

// Escape HTML function
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show typing indicator
function showTypingIndicator() {
    log('Showing typing indicator');
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.classList.add('show');
    }
}

// Hide typing indicator
function hideTypingIndicator() {
    log('Hiding typing indicator');
    const indicator = document.getElementById('typing-indicator');
    if (indicator) {
        indicator.classList.remove('show');
    }
}

// Update send button state
function updateSendButton() {
    const sendButton = document.getElementById('send-button');
    if (sendButton) {
        sendButton.disabled = isWaitingForResponse;
        if (isWaitingForResponse) {
            sendButton.innerHTML = '<span class="send-icon">⏳</span>';
        } else {
            sendButton.innerHTML = '<span class="send-icon">➤</span>';
        }
    }
    
    log(`Send button updated - Disabled: ${isWaitingForResponse}`);
}

// Scroll to bottom of chat
function scrollToBottom() {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

// Start new chat
function startNewChat() {
    log('Starting new chat');
    
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        chatContainer.innerHTML = `
            <div class="message assistant">
                <div class="message-content">
                    Hello! I'm codeIt, your AI coding assistant. I can see your active files and help you with your code. 
                    <br><br>
                    <strong>💡 Tips:</strong>
                    <ul>
                        <li>Your currently open file will automatically appear as context</li>
                        <li>Drag and drop files from the explorer to add them</li>
                        <li>Select code and it will be suggested as context</li>
                    </ul>
                </div>
            </div>
        `;
    }
    
    clearAllContext();
    vscode.postMessage({ command: 'newChat' });
}

// Show toast notification
function showToast(message, type = 'info') {
    log(`Showing toast: ${message} (${type})`);
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // Style toast
    Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '12px 16px',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: '500',
        zIndex: '1001',
        opacity: '0',
        transform: 'translateY(-20px)',
        transition: 'all 0.3s ease',
        maxWidth: '300px',
        wordWrap: 'break-word'
    });
    
    // Set colors based on type
    switch (type) {
        case 'success':
            toast.style.background = 'var(--success-color)';
            toast.style.color = 'white';
            break;
        case 'warning':
            toast.style.background = 'var(--warning-color)';
            toast.style.color = 'black';
            break;
        case 'error':
            toast.style.background = 'var(--error-color)';
            toast.style.color = 'white';
            break;
        default:
            toast.style.background = 'var(--vscode-button-background)';
            toast.style.color = 'var(--vscode-button-foreground)';
    }
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);
    
    // Animate out and remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Setup resize handler
function setupResizeHandler() {
    window.addEventListener('resize', () => {
        scrollToBottom();
    });
}

// Restore state
function restoreState() {
    const state = vscode.getState();
    if (state) {
        contextData = { ...contextData, ...state.contextData };
        updateContextDisplay();
        log('State restored from VS Code');
    }
}

// Save state
function saveState() {
    vscode.setState({
        contextData: contextData
    });
}

// Message listener for VS Code extension
window.addEventListener('message', event => {
    const message = event.data;
    
    log(`Received message from VS Code: ${message.command}`);
    
    switch (message.command) {
        case 'addMessage':
            addAssistantMessage(message.content);
            isWaitingForResponse = false;
            updateSendButton();
            hideTypingIndicator();
            log('Assistant message added');
            break;
            
        case 'showChangePreview':
            showChangePreview(message.preview);
            log('Change preview received');
            break;
            
        case 'updateContext':
            contextData = { ...contextData, ...message.context };
            updateContextDisplay();
            log('Context updated');
            break;
            
        case 'activeFileChanged':
            contextData.activeFile = message.file;
            updateActiveFileBanner(message.file);
            log(`Active file changed: ${message.file?.name || 'none'}`);
            break;
            
        case 'selectionChanged':
            if (message.selection && message.selection.trim()) {
                contextData.currentSelection = {
                    content: message.selection,
                    file: message.fileName || 'Unknown file'
                };
                showActiveSelectionBanner();
                updateContextDisplay();
                log(`Selection changed: ${message.selection.length} characters`);
            }
            break;
            
        case 'fileAdded':
            if (message.file) {
                addFileContext(message.file);
                log(`File added: ${message.file.name}`);
            }
            break;
            
        case 'codeAdded':
            if (message.code) {
                contextData.customCode.push(message.code);
                updateContextDisplay();
                showToast('Added custom code to context', 'success');
                log('Custom code added');
            }
            break;
            
        case 'error':
            console.error('Error from VS Code:', message.error);
            isWaitingForResponse = false;
            updateSendButton();
            hideTypingIndicator();
            addAssistantMessage('Sorry, there was an error processing your request. Please try again.');
            showToast('Error: ' + message.error, 'error');
            log(`Error received: ${message.error}`, 'error');
            break;
            
        case 'clearChat':
            startNewChat();
            log('Chat cleared');
            break;
            
        case 'setMode':
            if (message.mode) {
                currentMode = message.mode;
                updateModeDisplay();
                updateModeBanner();
                updateInputHelp();
                log(`Mode set to: ${message.mode}`);
            }
            break;
            
        default:
            log(`Unknown message command: ${message.command}`, 'warn');
    }
});

// Update active file banner
function updateActiveFileBanner(file) {
    const banner = document.getElementById('active-file-banner');
    const fileName = document.getElementById('active-file-name');
    const filePath = document.getElementById('active-file-path');
    
    if (file && banner && fileName && filePath) {
        fileName.textContent = file.name;
        filePath.textContent = file.path;
        banner.style.display = 'flex';
        log(`Active file banner updated: ${file.name}`);
    } else if (banner) {
        banner.style.display = 'none';
        log('Active file banner hidden');
    }
}

// Show active selection banner
function showActiveSelectionBanner() {
    if (contextData.currentSelection) {
        showToast(`Code selection available from ${contextData.currentSelection.file}`, 'info');
    }
}

// Change preview functions
function showChangePreview(preview) {
    const changePreviewHtml = `
        <div class="change-preview" data-file="${preview.filePath}">
            <div class="change-preview-header">
                <div class="change-preview-info">
                    <span class="change-icon">📝</span>
                    <span class="change-title">${preview.description}</span>
                    <span class="change-file">${preview.filePath}</span>
                    ${preview.lineRange ? `<span class="change-lines">Lines ${preview.lineRange}</span>` : ''}
                </div>
                <div class="change-preview-actions">
                    <button class="change-btn apply-btn" onclick="applyChange('${preview.filePath}')">
                        <span class="btn-icon">✅</span>
                        Apply
                    </button>
                    <button class="change-btn skip-btn" onclick="skipChange('${preview.filePath}')">
                        <span class="btn-icon">⏭️</span>
                        Skip
                    </button>
                    <button class="change-btn edit-btn" onclick="editChange('${preview.filePath}')">
                        <span class="btn-icon">✏️</span>
                        Edit
                    </button>
                </div>
            </div>
            <div class="change-preview-content">
                <div class="change-diff">
                    <div class="diff-section">
                        <div class="diff-header">Original Code</div>
                        <pre class="diff-code original"><code>${escapeHtml(preview.originalContent)}</code></pre>
                    </div>
                    <div class="diff-section">
                        <div class="diff-header">New Code</div>
                        <pre class="diff-code new"><code>${escapeHtml(preview.newContent)}</code></pre>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add to chat container
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        const changePreviewElement = document.createElement('div');
        changePreviewElement.className = 'message assistant change-preview-message';
        changePreviewElement.innerHTML = changePreviewHtml;
        chatContainer.appendChild(changePreviewElement);
        scrollToBottom();
    }
}

function applyChange(filePath) {
    log(`Applying change for ${filePath}`);
    vscode.postMessage({
        command: 'applyChange',
        filePath: filePath
    });
    removeChangePreview(filePath);
}

function skipChange(filePath) {
    log(`Skipping change for ${filePath}`);
    vscode.postMessage({
        command: 'skipChange',
        filePath: filePath
    });
    removeChangePreview(filePath);
}

function editChange(filePath) {
    log(`Editing change for ${filePath}`);
    vscode.postMessage({
        command: 'editChange',
        filePath: filePath
    });
}

function removeChangePreview(filePath) {
    const changePreview = document.querySelector(`[data-file="${filePath}"]`);
    if (changePreview) {
        changePreview.closest('.change-preview-message').remove();
    }
}

// Auto-save state periodically
setInterval(saveState, 5000);

// Request initial active file info after a short delay
setTimeout(requestActiveFileInfo, 500);

log('Script initialization complete');
