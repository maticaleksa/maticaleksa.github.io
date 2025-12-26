(() => {
    const app = document.querySelector('.app-container');
    if (!app) return;

    const page = location.pathname.split('/').pop() || 'index';
    const firebaseConfig = window.FIREBASE_CONFIG;
    if (!firebaseConfig || !window.firebase) {
        console.warn('Firebase config missing; comments disabled.');
        return;
    }

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.firestore();

    const style = document.createElement('style');
    style.textContent = `
        .comment-overlay {
            position: absolute;
            inset: 0;
            pointer-events: none;
            display: none;
            z-index: 30;
        }
        .comment-overlay.editing {
            pointer-events: auto;
        }
        .comment-dot {
            width: 8px;
            height: 8px;
            background: #22c55e;
            border-radius: 50%;
            position: absolute;
            transform: translate(-50%, -50%);
            box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
            pointer-events: auto;
        }
        .edit-badge {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(6, 182, 212, 0.2);
            color: #06b6d4;
            border: 1px solid rgba(6, 182, 212, 0.4);
            padding: 4px 8px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 600;
            display: none;
            z-index: 40;
        }
        .edit-hint {
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.4);
            color: #A3A3A3;
            border: 1px solid #333333;
            padding: 4px 8px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 600;
            z-index: 40;
        }
        .comments-panel {
            position: fixed;
            top: 0;
            left: 0;
            width: 80%;
            height: 100%;
            background: #1E1E1E;
            border: 1px solid #333333;
            border-radius: 16px;
            padding: 14px;
            display: none;
            z-index: 50;
            overflow: auto;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        }
        .comment-edit {
            overflow: visible !important;
        }
        .comments-panel h4 {
            font-size: 12px;
            color: #A3A3A3;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }
        .comments-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .comment-item {
            border: 1px solid #333333;
            border-radius: 10px;
            padding: 8px;
            font-size: 12px;
            color: #FFFFFF;
            background: #121212;
        }
        .comment-item strong {
            display: block;
            font-size: 12px;
            margin-bottom: 4px;
        }
        .comment-item.active {
            border-color: #22c55e;
            box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.3) inset;
        }
        .comment-modal {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }
        .comment-card {
            width: 90%;
            max-width: 320px;
            background: #1E1E1E;
            border: 1px solid #333333;
            border-radius: 16px;
            padding: 16px;
            color: #FFFFFF;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        }
        .comment-card h3 {
            font-size: 16px;
            margin-bottom: 10px;
        }
        .comment-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 10px;
        }
        .comment-field label {
            font-size: 12px;
            color: #A3A3A3;
        }
        .comment-field input,
        .comment-field textarea {
            background: #121212;
            border: 1px solid #333333;
            color: #FFFFFF;
            border-radius: 8px;
            padding: 8px;
            font-size: 13px;
        }
        .comment-field textarea {
            min-height: 70px;
            resize: vertical;
        }
        .comment-actions {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 6px;
        }
        .comment-btn {
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            border: 1px solid #333333;
            background: #121212;
            color: #FFFFFF;
        }
        .comment-btn.primary {
            background: #06b6d4;
            border-color: #06b6d4;
            color: #FFFFFF;
        }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'comment-overlay';
    app.appendChild(overlay);

    const badge = document.createElement('div');
    badge.className = 'edit-badge';
    badge.textContent = 'Edit mode';
    app.appendChild(badge);

    const hint = document.createElement('div');
    hint.className = 'edit-hint';
    hint.textContent = 'Press H to comment';
    app.appendChild(hint);

    const panel = document.createElement('div');
    panel.className = 'comments-panel';
    panel.innerHTML = `<h4>Comments</h4><div class="comments-list"></div>`;
    app.appendChild(panel);

    let editMode = false;
    let modalOpen = false;
    let unsubscribe = null;
    let currentItems = [];
    let selectedIndex = null;

    function isTyping(target) {
        if (!target) return false;
        const tag = target.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
    }

    function setEditMode(value) {
        editMode = value;
        badge.style.display = editMode ? 'block' : 'none';
        overlay.style.display = editMode ? 'block' : 'none';
        overlay.classList.toggle('editing', editMode);
        panel.style.display = editMode ? 'block' : 'none';
        app.classList.toggle('comment-edit', editMode);
        if (editMode) positionPanel();
        if (editMode) startListening();
        if (!editMode) stopListening();
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'h' && e.key !== 'H') return;
        if (isTyping(e.target)) return;
        setEditMode(!editMode);
    });

    overlay.addEventListener('click', (e) => {
        if (!editMode || modalOpen) return;
        if (e.target.closest('.comment-dot')) return;
        const rect = app.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        openModal(x, y);
    });

    function openModal(x, y) {
        modalOpen = true;
        const modal = document.createElement('div');
        modal.className = 'comment-modal';
        modal.innerHTML = `
            <div class="comment-card">
                <h3>Leave a comment</h3>
                <div class="comment-field">
                    <label for="comment-name">Name</label>
                    <input id="comment-name" name="name" type="text" placeholder="Your name">
                </div>
                <div class="comment-field">
                    <label for="comment-text">Comment</label>
                    <textarea id="comment-text" name="comment" placeholder="Add a note"></textarea>
                </div>
                <div class="comment-actions">
                    <button class="comment-btn" data-action="cancel">Cancel</button>
                    <button class="comment-btn primary" data-action="ok">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const nameInput = modal.querySelector('#comment-name');
        const commentInput = modal.querySelector('#comment-text');
        nameInput.focus();

        function closeModal() {
            modalOpen = false;
            modal.remove();
        }

        modal.addEventListener('click', (evt) => {
            if (evt.target === modal) closeModal();
        });

        modal.querySelector('[data-action="cancel"]').addEventListener('click', closeModal);
        modal.querySelector('[data-action="ok"]').addEventListener('click', async () => {
            const name = nameInput.value.trim();
            const comment = commentInput.value.trim();
            if (!name || !comment) return;

            try {
                renderComments([...currentItems, { x, y, name, comment }]);
                await db.collection('comments').add({
                    page,
                    x,
                    y,
                    name,
                    comment,
                    createdAtMs: Date.now(),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                closeModal();
            } catch (err) {
                closeModal();
            }
        });
    }

    function startListening() {
        stopListening();
        const query = db.collection('comments').where('page', '==', page);

        query.get().then((snapshot) => {
            const items = [];
            snapshot.forEach((doc) => items.push(doc.data()));
            items.sort((a, b) => {
                const aMs = a.createdAtMs || (a.createdAt && a.createdAt.seconds ? a.createdAt.seconds * 1000 : 0);
                const bMs = b.createdAtMs || (b.createdAt && b.createdAt.seconds ? b.createdAt.seconds * 1000 : 0);
                return aMs - bMs;
            });
            renderComments(items);
        });

        unsubscribe = query.onSnapshot((snapshot) => {
            const items = [];
            snapshot.forEach((doc) => items.push(doc.data()));
            items.sort((a, b) => {
                const aMs = a.createdAtMs || (a.createdAt && a.createdAt.seconds ? a.createdAt.seconds * 1000 : 0);
                const bMs = b.createdAtMs || (b.createdAt && b.createdAt.seconds ? b.createdAt.seconds * 1000 : 0);
                return aMs - bMs;
            });
            renderComments(items);
        });
    }

    function stopListening() {
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        overlay.innerHTML = '';
        panel.querySelector('.comments-list').innerHTML = '';
        selectedIndex = null;
    }

    function renderComments(items) {
        currentItems = items;
        overlay.innerHTML = '';
        if (selectedIndex === null && items.length) {
            selectedIndex = items.length - 1;
        }
        if (selectedIndex !== null && selectedIndex >= items.length) {
            selectedIndex = null;
        }
        items.forEach((item, index) => {
            const dot = document.createElement('div');
            dot.className = 'comment-dot';
            dot.style.left = `${item.x * 100}%`;
            dot.style.top = `${item.y * 100}%`;
            dot.title = `${item.name}: ${item.comment}`;
            dot.addEventListener('click', (evt) => {
                evt.stopPropagation();
                selectedIndex = index;
                renderPanel();
            });
            overlay.appendChild(dot);
        });
        renderPanel();
    }

    function renderPanel() {
        const list = panel.querySelector('.comments-list');
        list.innerHTML = '';
        currentItems.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'comment-item' + (index === selectedIndex ? ' active' : '');
            row.innerHTML = `<strong>${item.name}</strong>${item.comment}`;
            row.addEventListener('click', () => {
                selectedIndex = index;
                renderPanel();
            });
            list.appendChild(row);
        });
    }

    function positionPanel() {
        const rect = app.getBoundingClientRect();
        panel.style.top = `${rect.top}px`;
        panel.style.left = `${rect.right + 12}px`;
        panel.style.height = `${rect.height}px`;
        panel.style.width = `${Math.round(rect.width * 0.8)}px`;
    }

    window.addEventListener('resize', () => {
        if (editMode) positionPanel();
    });
})();
