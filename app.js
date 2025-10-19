// --- グローバル変数 ---
let allKarutaData = []; // fetchで読み込む
let teiichiData = {};
let currentGameTimer = null;
let currentKaraFudaIds = [];
const TOTAL_ROWS = 3;
let selectedFuda = null; // ★ クリック選択中の札
let originalParent = null; // ★ 選択した札の元の親要素

// --- DOM要素の取得 ---
const startButton = document.getElementById('startButton');
const jiJinField = document.getElementById('jiJin');
const tekiJinField = document.getElementById('tekiJin');
const karaFudaList = document.getElementById('karaFudaList');
const manualArea = document.getElementById('manualArea');
const temaeFudaArea = document.getElementById('temaeFuda');
const jiJinModeSelect = document.getElementById('jiJinMode');
const timerSelect = document.getElementById('timerSelect');
const timerDisplay = document.getElementById('timerDisplay');
const toggleKaraFuda = document.getElementById('toggleKaraFuda');
const instructionText = document.getElementById('instructionText');
const digitModeRadios = document.querySelectorAll('input[name="digitMode"]');
const manualDigitSelection = document.getElementById('manualDigitSelection');
const digitCheckboxesContainer = document.getElementById('digitCheckboxes');
const selectedDigitsDisplay = document.getElementById('selectedDigitsDisplay');

// --- イベントリスナー ---
// initialize 関数内で設定

// --- 初期化処理 ---
async function initialize() {
    console.log("Initializing app...");
    // 1. 札データの読み込み
    try {
        const response = await fetch('karuta_data.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        allKarutaData = await response.json();
    } catch (e) {
        console.error("札データの読み込みに失敗:", e);
        alert("karuta_data.json の読み込みに失敗しました。");
        return;
    }
    // 2. 定位置データの読み込み
    const savedTeiichi = localStorage.getItem('karutaTeiichi');
    if (savedTeiichi) { try { teiichiData = JSON.parse(savedTeiichi); console.log("定位置読み込み:", teiichiData); } catch(e) { console.error("定位置解析失敗"); localStorage.removeItem('karutaTeiichi'); }}
    else { console.log("カスタム定位置なし"); }

    // ★ チェックボックス生成
    createDigitCheckboxes();
    // 3. クリックリスナー設定
    setupClickListeners(); // 配置用
    // ★ イベントリスナーをここで設定
    if (startButton) { startButton.addEventListener('click', startGame); console.log("Start listener attached."); }
    else { console.error("Start button not found!"); }
    if (toggleKaraFuda) { toggleKaraFuda.addEventListener('click', toggleKaraFudaVisibility); }
    digitModeRadios.forEach(radio => radio.addEventListener('change', handleDigitModeChange));

    updateInstructionText();
    console.log("Initialization complete.");
}

// --- ★ 新UI関連関数 ---
function createDigitCheckboxes() { digitCheckboxesContainer.innerHTML = ''; for (let i = 0; i <= 9; i++) { const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = i; checkbox.addEventListener('change', validateCheckboxSelection); label.appendChild(checkbox); label.appendChild(document.createTextNode(` ${i}`)); digitCheckboxesContainer.appendChild(label); } }
function handleDigitModeChange() { if (document.querySelector('input[name="digitMode"]:checked').value === 'manual') { manualDigitSelection.classList.remove('hidden'); } else { manualDigitSelection.classList.add('hidden'); } }
function validateCheckboxSelection() { const checkedBoxes = digitCheckboxesContainer.querySelectorAll('input[type="checkbox"]:checked'); if (checkedBoxes.length > 5) { alert('数字は5つまで選択できます。'); this.checked = false; } }
function getSelectedEndingDigits() { const mode = document.querySelector('input[name="digitMode"]:checked').value; let selectedDigits = []; if (mode === 'random') { const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; digits.sort(() => 0.5 - Math.random()); selectedDigits = digits.slice(0, 5); } else { const checkedBoxes = digitCheckboxesContainer.querySelectorAll('input[type="checkbox"]:checked'); if (checkedBoxes.length !== 5) { alert('手動選択モードでは、数字をちょうど5つ選択してください。'); return null; } selectedDigits = Array.from(checkedBoxes).map(box => parseInt(box.value)); } selectedDigits.sort((a, b) => a - b); selectedDigitsDisplay.textContent = selectedDigits.join(', '); return selectedDigits; }

// --- メインの関数 ---
function createRows(fieldElement, prefix) { fieldElement.innerHTML = ''; for (let i = 0; i < TOTAL_ROWS; i++) { const row = document.createElement('div'); row.className = 'row-slot'; row.dataset.rowId = `${prefix}-${i}`; const leftGroup = document.createElement('div'); leftGroup.className = 'left-group'; leftGroup.dataset.groupId = `${prefix}-${i}-left`; const rightGroup = document.createElement('div'); rightGroup.className = 'right-group'; rightGroup.dataset.groupId = `${prefix}-${i}-right`; row.appendChild(leftGroup); row.appendChild(rightGroup); fieldElement.appendChild(row); } }

function startGame() {
    console.log("Start button clicked!");
    if (currentGameTimer) { clearInterval(currentGameTimer); currentGameTimer = null; }
    const selectedMinutes = parseInt(timerSelect.value);
    timerDisplay.textContent = `${selectedMinutes < 10 ? '0' : ''}${selectedMinutes}:00`;
    timerSelect.disabled = false;

    // ★ 数字選択 & 札選定
    const endingDigits = getSelectedEndingDigits();
    if (!endingDigits) { console.error("Ending digits failed."); return; }
    const usedFudaData = allKarutaData.filter(fuda => endingDigits.includes(fuda.id % 10));
    const usedFudaIds = usedFudaData.map(fuda => fuda.id);
    const allFudaIds = allKarutaData.map(fuda => fuda.id);
    const karaFudaIds = allFudaIds.filter(id => !usedFudaIds.includes(id));
    currentKaraFudaIds = karaFudaIds;
    console.log("使用札:", usedFudaIds.length, "枚", usedFudaIds);
    console.log("空札:", karaFudaIds.length, "枚");

    // ★ 札シャッフル & 分配
    const shuffledUsedIds = [...usedFudaIds].sort(() => 0.5 - Math.random());
    const playerCardCount = Math.floor(shuffledUsedIds.length / 2);
    const jiJinFudaIds = shuffledUsedIds.slice(0, playerCardCount);
    const tekiJinFudaIds = shuffledUsedIds.slice(playerCardCount);

    // --- 以降は既存ロジック ---
    if (selectedFuda) cancelSelection();
    document.body.removeEventListener('click', handleFlipClick);
    setupClickListeners();

    temaeFudaArea.innerHTML = '';
    manualArea.classList.add('hidden');
    jiJinField.classList.remove('manual-setup');
    createRows(jiJinField, 'j');
    createRows(tekiJinField, 't');

    karaFudaList.innerHTML = '';
    karaFudaList.classList.add('hidden');
    const karaFudaHeader = document.querySelector('#toggleKaraFuda').parentElement;
     if (karaFudaHeader && karaFudaHeader.firstChild.nodeType === Node.TEXT_NODE) {
       karaFudaHeader.firstChild.textContent = `空札 (${currentKaraFudaIds.length}枚) `;
    }

    placeFudaInRows(tekiJinField, tekiJinFudaIds);
    const jiJinMode = jiJinModeSelect.value;
    if (jiJinMode === 'auto') {
        placeFudaInRows(jiJinField, jiJinFudaIds);
        startTimer(selectedMinutes * 60);
    } else {
        setupJiJinManual(jiJinFudaIds);
    }
    updateInstructionText();
}

function placeFudaInRows(fieldElement, fudaIds) { const rows = Array.from(fieldElement.querySelectorAll('.row-slot')); const groups = { topLeft: rows[0].querySelector('.left-group'), topRight: rows[0].querySelector('.right-group'), midLeft: rows[1].querySelector('.left-group'), midRight: rows[1].querySelector('.right-group'), bottomLeft: rows[2].querySelector('.left-group'), bottomRight: rows[2].querySelector('.right-group') }; const oneCharIds = [87, 18, 57, 22, 70, 81, 77]; const oyamaFudaIds = [31, 64, 15, 50, 76, 11]; let fudaToPlace = fudaIds.map(id => allKarutaData.find(f => f.id === id)).sort(() => 0.5 - Math.random()); const rightCount = Math.ceil(fudaToPlace.length / 2); let leftFudaCount = 0; let rightFudaCount = 0; const oneCharFuda = fudaToPlace.filter(f => oneCharIds.includes(f.id)); const oyamaFuda = fudaToPlace.filter(f => oyamaFudaIds.includes(f.id)); const otherFuda = fudaToPlace.filter(f => !oneCharIds.includes(f.id) && !oyamaFudaIds.includes(f.id)); oneCharFuda.forEach((fuda, index) => { const fudaElement = createFudaElement(fuda); if (index % 2 === 0 && rightFudaCount < rightCount) { groups.bottomRight.appendChild(fudaElement); rightFudaCount++; } else { groups.bottomLeft.appendChild(fudaElement); leftFudaCount++; } }); oyamaFuda.forEach(fuda => { const fudaElement = createFudaElement(fuda); if (rightFudaCount < rightCount) { if (groups.bottomRight.children.length < 5) { groups.bottomRight.appendChild(fudaElement); } else { groups.midRight.appendChild(fudaElement); } rightFudaCount++; } else { groups.midLeft.appendChild(fudaElement); leftFudaCount++; } }); otherFuda.forEach(fuda => { const fudaElement = createFudaElement(fuda); if (rightFudaCount < rightCount) { if (groups.topRight.children.length < 5) groups.topRight.appendChild(fudaElement); else if (groups.midRight.children.length < 5) groups.midRight.appendChild(fudaElement); else groups.bottomRight.appendChild(fudaElement); rightFudaCount++; } else { if (groups.topLeft.children.length < 5) groups.topLeft.appendChild(fudaElement); else if (groups.midLeft.children.length < 5) groups.midLeft.appendChild(fudaElement); else groups.bottomLeft.appendChild(fudaElement); leftFudaCount++; } }); }
function setupJiJinManual(fudaIds) { manualArea.classList.remove('hidden'); temaeFudaArea.innerHTML = ''; fudaIds.forEach(id => { const fuda = allKarutaData.find(f => f.id === id); const fudaElement = createFudaElement(fuda); temaeFudaArea.appendChild(fudaElement); }); jiJinField.classList.add('manual-setup'); updateInstructionText(); }

// 4. ★ クリックイベントリスナー設定 (変更なし)
function setupClickListeners() { document.body.removeEventListener('click', handleFieldClick); document.body.removeEventListener('click', handleFlipClick); document.body.addEventListener('click', handleFieldClick); }

// 4a. ★ クリックイベントハンドラ (カーソル追従方式に戻す)
function handleFieldClick(e) {
    const clickedElement = e.target;

    // --- 札を選択中の場合 (2回目のクリック) ---
    if (selectedFuda) {
        let dropTargetContainer = clickedElement.closest('.left-group, .right-group, #temaeFuda');
        if (!dropTargetContainer && clickedElement.closest('.row-slot')) {
            const rowSlot = clickedElement.closest('.row-slot');
            const rowRect = rowSlot.getBoundingClientRect();
            const clickXRatio = (e.clientX - rowRect.left) / rowRect.width;
            dropTargetContainer = clickXRatio < 0.5 ? rowSlot.querySelector('.left-group') : rowSlot.querySelector('.right-group');
        }

        const isInManualSetup = jiJinField.classList.contains('manual-setup');
        const isTimerRunning = currentGameTimer !== null;
        const isAllowedJiJinGroup = dropTargetContainer && (dropTargetContainer.classList.contains('left-group') || dropTargetContainer.classList.contains('right-group')) && jiJinField.contains(dropTargetContainer) && (isInManualSetup || isTimerRunning);
        const isAllowedTemaeFuda = dropTargetContainer && dropTargetContainer.id === 'temaeFuda' && isInManualSetup;

        if (isAllowedJiJinGroup || isAllowedTemaeFuda) {
            const afterElement = getInsertBeforeElement(dropTargetContainer, e.clientX);
            // ★ スタイルをリセット
            selectedFuda.style.position = '';
            selectedFuda.style.left = '';
            selectedFuda.style.top = '';
            selectedFuda.classList.remove('selected');

            if (afterElement == null) {
                dropTargetContainer.appendChild(selectedFuda);
            } else {
                dropTargetContainer.insertBefore(selectedFuda, afterElement);
            }
            // ★ 選択解除
            selectedFuda = null;
            originalParent = null;
            document.body.removeEventListener('mousemove', followCursor); // ★ 追従停止
            checkManualPlacementComplete();
        } else {
            cancelSelection(); // 無効な場所クリック
        }
        updateInstructionText();
    }
    // --- 札を選択中でない場合 (1回目のクリック) ---
    else {
        const clickedFuda = clickedElement.closest('.fuda');
        const isInManualSetup = jiJinField.classList.contains('manual-setup');
        const isTimerRunning = currentGameTimer !== null;

        if (clickedFuda && !clickedFuda.closest('#tekiJin') && (isInManualSetup || isTimerRunning)) {
             if (clickedFuda.classList.contains('back')) return; // 裏返しモード中は選択しない

            selectedFuda = clickedFuda;
            originalParent = selectedFuda.parentElement;

            // ★ カーソル追従モードにする
            selectedFuda.style.position = 'absolute';
            selectedFuda.style.left = `${e.pageX + 5}px`; // 初期位置
            selectedFuda.style.top = `${e.pageY + 5}px`;  // 初期位置
            selectedFuda.classList.add('selected');

            // ★ カーソル追従を開始
            document.body.addEventListener('mousemove', followCursor);
            updateInstructionText();
        }
    }
}

// 4b. ★ カーソル追従関数 (復活)
function followCursor(e) {
    if (selectedFuda) {
        selectedFuda.style.left = `${e.pageX + 5}px`;
        selectedFuda.style.top = `${e.pageY + 5}px`;
    }
}

// 4c. ★ 選択キャンセル関数 (カーソル追従方式に戻す)
function cancelSelection() {
    if (selectedFuda && originalParent) {
        // ★ スタイルリセット
        selectedFuda.style.position = '';
        selectedFuda.style.left = '';
        selectedFuda.style.top = '';
        selectedFuda.classList.remove('selected');
        // ★ 元の場所に戻す
        originalParent.appendChild(selectedFuda);
        selectedFuda = null;
        originalParent = null;
        document.body.removeEventListener('mousemove', followCursor); // ★ 追従停止
        // console.log("Selection Cancelled");
    } else if (selectedFuda) {
         selectedFuda.style.position = '';
         selectedFuda.style.left = '';
         selectedFuda.style.top = '';
         selectedFuda.classList.remove('selected');
         if(temaeFudaArea) temaeFudaArea.appendChild(selectedFuda); // 念のため手札に戻す
         selectedFuda = null;
         originalParent = null;
         document.body.removeEventListener('mousemove', followCursor); // ★ 追従停止
         // console.warn("Cancel unknown parent.");
    }
     updateInstructionText();
}

// 4d. ★ 挿入位置決定関数 (変更なし)
function getInsertBeforeElement(container, x) { const children = [...container.querySelectorAll('.fuda:not(.selected)')]; const elementToInsertBefore = children.find(child => { const box = child.getBoundingClientRect(); return x < box.left + box.width / 2; }); return elementToInsertBefore; }
// 4e. 手動配置完了チェック (変更なし)
function checkManualPlacementComplete() { if (manualArea.classList.contains('hidden')) return; const fudaInTemate = temaeFudaArea.querySelectorAll('.fuda').length; if (fudaInTemate === 0) { manualArea.classList.add('hidden'); jiJinField.classList.remove('manual-setup'); const selectedMinutes = parseInt(timerSelect.value); startTimer(selectedMinutes * 60); } }

// 5. タイマー開始 (★ 操作説明テキスト変更)
function startTimer(duration) { if (currentGameTimer) clearInterval(currentGameTimer); timerSelect.disabled = true; updateInstructionText("暗記中 (自陣の札をクリックで選択、移動先をクリックで配置)"); let timer = duration; currentGameTimer = setInterval(() => { const minutes = Math.floor(timer / 60); const seconds = timer % 60; timerDisplay.textContent = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`; if (--timer < 0) { clearInterval(currentGameTimer); currentGameTimer = null; timerDisplay.textContent = "暗記終了！"; timerSelect.disabled = false; enterPracticeMode(); } }, 1000); }
// 6. 暗記練習モード (変更なし)
function enterPracticeMode() { if (selectedFuda) cancelSelection(); const allBaFuda = document.querySelectorAll('#jiJin .fuda, #tekiJin .fuda'); allBaFuda.forEach(fuda => { fuda.classList.add('back'); fuda.style.cursor = 'pointer'; }); document.body.removeEventListener('click', handleFieldClick); document.body.addEventListener('click', handleFlipClick); updateInstructionText("暗記練習中 (裏向きの札をクリックで確認)"); }
// 6b. ★ 裏返すためのクリックハンドラ (変更なし)
function handleFlipClick(e) { if (currentGameTimer === null) { const clickedFuda = e.target.closest('.fuda.back'); if (clickedFuda) { clickedFuda.classList.toggle('back'); } } }

// ★ 操作説明更新関数 (★ メッセージ変更)
function updateInstructionText(customText = null) {
    const textElement = document.getElementById('instructionText');
    if (!textElement) return;

    if (customText) {
        textElement.textContent = customText;
        return;
    }

    const isInManualSetup = jiJinField.classList.contains('manual-setup');
    const isTimerRunning = currentGameTimer !== null;

    if (selectedFuda) {
        textElement.textContent = "配置したい場所をクリックしてください (無効な場所クリックでキャンセル)"; // 追従版
    } else if (isInManualSetup) {
        textElement.textContent = "手札の札をクリックして選択し、自陣または手札に戻したい場所をクリックして配置"; // 追従版
    } else if (isTimerRunning) {
        textElement.textContent = "自陣の札をクリックして選択し、移動させたい場所をクリックして配置"; // 追従版
    } else if (currentGameTimer === null && !isInManualSetup && document.querySelector('.fuda.back')) {
         textElement.textContent = "暗記練習中 (裏向きの札をクリックで確認)";
    }
     else {
        textElement.textContent = "「開始」ボタンを押してください";
    }
}

// --- 空札表示用の関数 --- (変更なし)
function toggleKaraFudaVisibility() { const isNowHidden = karaFudaList.classList.toggle('hidden'); if (!isNowHidden && karaFudaList.innerHTML === '') { if (currentKaraFudaIds.length > 0) displayKaraFuda(currentKaraFudaIds); else karaFudaList.innerHTML = '<p>まだ試合が開始されていません。</p>'; } }
function displayKaraFuda(fudaIds) { karaFudaList.innerHTML = ''; const karaFudaHeader = document.querySelector('#toggleKaraFuda').parentElement; if (karaFudaHeader && karaFudaHeader.firstChild.nodeType === Node.TEXT_NODE) { karaFudaHeader.firstChild.textContent = `空札 (${fudaIds.length}枚) `; } const karaFudaData = fudaIds .map(id => allKarutaData.find(fuda => fuda.id === id)) .filter(fuda => fuda) .sort((a, b) => a.id - b.id); karaFudaData.forEach(fuda => { const fudaElement = createFudaElement(fuda); fudaElement.style.transform = 'none'; fudaElement.style.cursor = 'default'; karaFudaList.appendChild(fudaElement); }); }

// --- ユーティリティ関数 ---
// ★ 札のHTML要素を作成 (ID表示付き - 変更なし)
function createFudaElement(fuda) {
    const div = document.createElement('div');
    div.className = 'fuda';
    div.style.backgroundImage = `url('${fuda.image_path}')`;
    div.dataset.id = fuda.id;
    // draggable は削除
    div.title = `[${fuda.id}] ${fuda.kami}\n${fuda.shimo}`;
    // ★ ID表示用の要素を追加
    const idSpan = document.createElement('span');
    idSpan.className = 'fuda-id';
    idSpan.textContent = fuda.id;
    div.appendChild(idSpan);
    return div;
}

// --- 起動 ---
// DOMContentLoaded を待って initialize を実行 (fetch版のため)
document.addEventListener('DOMContentLoaded', initialize);