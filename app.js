// --- グローバル変数 ---
let allKarutaData = []; // 100枚すべての札データ (fetchで読み込む)
let teiichiData = {};   // ユーザーの定位置データ
let currentGameTimer = null; // 実行中のタイマー
let currentKaraFudaIds = []; // 現在の空札IDリスト
const TOTAL_ROWS = 3; // 3段
let selectedFuda = null; // ★ クリック選択中の札
let originalParent = null; // ★ 選択した札の元の親要素

// --- DOM要素の取得 ---
const startButton = document.getElementById('startButton');
const jiJinField = document.getElementById('jiJin');
const tekiJinField = document.getElementById('tekiJin');
const karaFudaList = document.getElementById('karaFudaList');
const manualArea = document.getElementById('manualArea');
const temaeFudaArea = document.getElementById('temaeFuda');
const cardCountInput = document.getElementById('cardCount');
const jiJinModeSelect = document.getElementById('jiJinMode');

const timerSelect = document.getElementById('timerSelect');
const timerDisplay = document.getElementById('timerDisplay');
const toggleKaraFuda = document.getElementById('toggleKaraFuda');
// ★ 操作説明用の要素 (後で index.html に追加)
const instructionText = document.getElementById('instructionText');

// --- イベントリスナー ---
startButton.addEventListener('click', startGame);
toggleKaraFuda.addEventListener('click', toggleKaraFudaVisibility);

// --- 初期化処理 ---
// JSON読み込みのために async をつける
async function initialize() {
    // 1. 札データの読み込み (JSON分離版)
    try {
        const response = await fetch('karuta_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allKarutaData = await response.json();
    } catch (e) {
        console.error("札データの読み込みに失敗:", e);
        alert("karuta_data.json の読み込みに失敗しました。\nファイルが存在するか、サーバーが正しく動作しているか確認してください。");
        return; // データがないと進めない
    }

    // 2. 定位置データの読み込み
    const savedTeiichi = localStorage.getItem('karutaTeiichi');
    if (savedTeiichi) {
        try {
            teiichiData = JSON.parse(savedTeiichi);
            console.log("定位置データを読み込みました:", teiichiData);
        } catch (e) {
            console.error("定位置データの解析に失敗:", e);
            localStorage.removeItem('karutaTeiichi'); // 壊れたデータを削除
        }
    } else {
        console.log("カスタム定位置データはありません。");
    }

    // 3. ★ クリックリスナーの設定
    setupClickListeners();
    // ★ 初期の操作説明を表示
    updateInstructionText();
}

// --- メインの関数 ---

// 「段」と「左右グループ」を生成する関数
function createRows(fieldElement, prefix) {
    fieldElement.innerHTML = ''; // 中身をリセット
    for (let i = 0; i < TOTAL_ROWS; i++) {
        const row = document.createElement('div');
        row.className = 'row-slot';
        row.dataset.rowId = `${prefix}-${i}`;

        const leftGroup = document.createElement('div');
        leftGroup.className = 'left-group';
        leftGroup.dataset.groupId = `${prefix}-${i}-left`;

        const rightGroup = document.createElement('div');
        rightGroup.className = 'right-group';
        rightGroup.dataset.groupId = `${prefix}-${i}-right`;

        row.appendChild(leftGroup);
        row.appendChild(rightGroup);
        fieldElement.appendChild(row);
    }
}

// 1. ゲーム開始
function startGame() {
    // 0. タイマーリセット
    if (currentGameTimer) {
        clearInterval(currentGameTimer);
         currentGameTimer = null; // ★ タイマー変数をリセット
    }
    const selectedMinutes = parseInt(timerSelect.value);
    timerDisplay.textContent = `${selectedMinutes < 10 ? '0' : ''}${selectedMinutes}:00`;
    timerSelect.disabled = false;

    // 選択中の札があればリセット
    if (selectedFuda) {
        cancelSelection();
    }
    // 暗記練習用のクリックリスナーを解除 (もしあれば)
    document.body.removeEventListener('click', handleFlipClick);
    // 配置用のクリックリスナーを再設定 (startGameごとに実行)
    setupClickListeners();


    // 1. フィールドをリセット
    temaeFudaArea.innerHTML = '';
    manualArea.classList.add('hidden');
    jiJinField.classList.remove('manual-setup');

    createRows(jiJinField, 'j');
    createRows(tekiJinField, 't');

    // 2. 設定を取得
    const totalCount = parseInt(cardCountInput.value);
    const jiJinMode = jiJinModeSelect.value;
    const playerCardCount = totalCount / 2;

    const maxCardsPerSide = 25;
    if (totalCount > (maxCardsPerSide * 2) || totalCount < 2 || totalCount % 2 !== 0) {
        alert(`札数は2～${maxCardsPerSide * 2} (50枚) の偶数を指定してください。`);
        return;
    }

    // 3. 札をシャッフルして選定
    const shuffledIds = allKarutaData.map(fuda => fuda.id).sort(() => 0.5 - Math.random());

    const baFudaIds = shuffledIds.slice(0, totalCount);
    const karaFudaIds = shuffledIds.slice(totalCount);
    currentKaraFudaIds = karaFudaIds;

    const jiJinFudaIds = baFudaIds.slice(0, playerCardCount);
    const tekiJinFudaIds = baFudaIds.slice(playerCardCount);

    // 4. 空札リストを初期化 (非表示のまま中身を空にする)
    karaFudaList.innerHTML = '';
    karaFudaList.classList.add('hidden');

    const karaFudaHeader = document.querySelector('#toggleKaraFuda').parentElement;
    if (karaFudaHeader && karaFudaHeader.firstChild.nodeType === Node.TEXT_NODE) {
       karaFudaHeader.firstChild.textContent = `空札 (${currentKaraFudaIds.length}枚) `;
    }


    // 5. 相手陣を配置 (AIロジック)
    placeFudaInRows(tekiJinField, tekiJinFudaIds);

    // 6. 自陣の配置 (モード分岐)
    if (jiJinMode === 'auto') {
        placeFudaInRows(jiJinField, jiJinFudaIds);
        startTimer(selectedMinutes * 60);
    } else {
        setupJiJinManual(jiJinFudaIds);
    }
    // ★ 操作説明を更新
    updateInstructionText();
}

// 2. 札を「段」の左右グループに配置する (AI / 自動配置)
function placeFudaInRows(fieldElement, fudaIds) {
    const rows = Array.from(fieldElement.querySelectorAll('.row-slot'));
    const groups = {
        topLeft: rows[0].querySelector('.left-group'),
        topRight: rows[0].querySelector('.right-group'),
        midLeft: rows[1].querySelector('.left-group'),
        midRight: rows[1].querySelector('.right-group'),
        bottomLeft: rows[2].querySelector('.left-group'),
        bottomRight: rows[2].querySelector('.right-group')
    };

    const oneCharIds = [87, 18, 57, 22, 70, 81, 77];
    const oyamaFudaIds = [31, 64, 15, 50, 76, 11];

    let fudaToPlace = fudaIds.map(id => allKarutaData.find(f => f.id === id)).sort(() => 0.5 - Math.random());

    // 1. 枚数バランス: 右側をわずかに多く (例: 25枚なら 左12, 右13)
    const rightCount = Math.ceil(fudaToPlace.length / 2);

    let leftFudaCount = 0;
    let rightFudaCount = 0;

    // 2. セオリー札の振り分け
    const oneCharFuda = fudaToPlace.filter(f => oneCharIds.includes(f.id));
    const oyamaFuda = fudaToPlace.filter(f => oyamaFudaIds.includes(f.id));
    const otherFuda = fudaToPlace.filter(f => !oneCharIds.includes(f.id) && !oyamaFudaIds.includes(f.id));

    // 2a. 一字決まりは左右の下段に分散
    oneCharFuda.forEach((fuda, index) => {
        const fudaElement = createFudaElement(fuda);
        if (index % 2 === 0 && rightFudaCount < rightCount) {
            groups.bottomRight.appendChild(fudaElement);
            rightFudaCount++;
        } else {
            groups.bottomLeft.appendChild(fudaElement);
            leftFudaCount++;
        }
    });

    // 2b. 大山札は右側（利き手側）の中下段に
    oyamaFuda.forEach(fuda => {
        const fudaElement = createFudaElement(fuda);
        if (rightFudaCount < rightCount) {
            if (groups.bottomRight.children.length < 5) {
                groups.bottomRight.appendChild(fudaElement);
            } else {
                groups.midRight.appendChild(fudaElement);
            }
            rightFudaCount++;
        } else {
             groups.midLeft.appendChild(fudaElement);
             leftFudaCount++;
        }
    });

    // 2c. 残りの札を、残りの左右カウントに達するまで配置
    otherFuda.forEach(fuda => {
        const fudaElement = createFudaElement(fuda);
        if (rightFudaCount < rightCount) {
            if (groups.topRight.children.length < 5) groups.topRight.appendChild(fudaElement);
            else if (groups.midRight.children.length < 5) groups.midRight.appendChild(fudaElement);
            else groups.bottomRight.appendChild(fudaElement);
            rightFudaCount++;
        } else {
            if (groups.topLeft.children.length < 5) groups.topLeft.appendChild(fudaElement);
            else if (groups.midLeft.children.length < 5) groups.midLeft.appendChild(fudaElement);
            else groups.bottomLeft.appendChild(fudaElement);
            leftFudaCount++;
        }
    });
}


// 3b. 自陣の手動配置（準備）
function setupJiJinManual(fudaIds) {
    manualArea.classList.remove('hidden');
    temaeFudaArea.innerHTML = ''; // 手札エリアをクリア

    fudaIds.forEach(id => {
        const fuda = allKarutaData.find(f => f.id === id);
        const fudaElement = createFudaElement(fuda);
        temaeFudaArea.appendChild(fudaElement); // 手札エリアに札を配置
    });

    jiJinField.classList.add('manual-setup');
    // ★ 操作説明を更新
    updateInstructionText();
}

// 4. ★ クリックイベントリスナー設定
function setupClickListeners() {
    // 既存のリスナーがあれば削除 (重複防止)
    document.body.removeEventListener('click', handleFieldClick);
    document.body.removeEventListener('mousemove', followCursor);
    document.body.removeEventListener('click', handleFlipClick); // 暗記用も念のため

    // クリックイベントを body に設定 (イベント委譲)
    document.body.addEventListener('click', handleFieldClick);
}

// 4a. ★ クリックイベントハンドラ (修正版)
function handleFieldClick(e) {
    const clickedElement = e.target;

    // --- 札を選択中の場合 (2回目のクリック) ---
    if (selectedFuda) {
        // クリックされた要素、またはその祖先で最も近いグループか手札エリアを探す
        let dropTargetContainer = clickedElement.closest('.left-group, .right-group, #temaeFuda');

        // もしグループや手札エリアでなく、row-slot内をクリックした場合、
        // そのrow-slot内の左右どちらかのグループかを判定する (クリックX座標基準)
        if (!dropTargetContainer && clickedElement.closest('.row-slot')) {
            const rowSlot = clickedElement.closest('.row-slot');
            const rowRect = rowSlot.getBoundingClientRect();
            const clickXRatio = (e.clientX - rowRect.left) / rowRect.width; // クリック位置の左右割合 (0-1)
            dropTargetContainer = clickXRatio < 0.5 ? rowSlot.querySelector('.left-group') : rowSlot.querySelector('.right-group');
            // console.log(`Clicked in row-slot gap, ratio: ${clickXRatio.toFixed(2)}, target: ${dropTargetContainer.dataset.groupId}`);
        }

        // 有効なドロップ先コンテナか？
        const isInManualSetup = jiJinField.classList.contains('manual-setup');
        const isTimerRunning = currentGameTimer !== null; // タイマーが動いているか

        // 配置が許可されるのは、「手動設定中の自陣グループ/手札」または「タイマー作動中の自陣グループ」
        const isAllowedJiJinGroup = dropTargetContainer && (dropTargetContainer.classList.contains('left-group') || dropTargetContainer.classList.contains('right-group')) && jiJinField.contains(dropTargetContainer) && (isInManualSetup || isTimerRunning);
        const isAllowedTemaeFuda = dropTargetContainer && dropTargetContainer.id === 'temaeFuda' && isInManualSetup; // 手札に戻せるのは手動設定中のみ


        if (isAllowedJiJinGroup || isAllowedTemaeFuda) {

            // 挿入位置を決定 (クリック位置基準)
            const afterElement = getInsertBeforeElement(dropTargetContainer, e.clientX);

            // スタイルをリセットして配置
            selectedFuda.style.position = '';
            selectedFuda.style.left = '';
            selectedFuda.style.top = '';
            selectedFuda.classList.remove('selected');

            if (afterElement == null) {
                dropTargetContainer.appendChild(selectedFuda);
            } else {
                dropTargetContainer.insertBefore(selectedFuda, afterElement);
            }

            // 選択解除
            selectedFuda = null;
            originalParent = null; // ★ 元の親情報をクリア
            document.body.removeEventListener('mousemove', followCursor); // カーソル追従を停止

            // 手動配置完了チェック
            checkManualPlacementComplete();

        } else {
            // console.log("Invalid drop location or state. Cancelling selection.", {dropTargetContainer, isInManualSetup, isTimerRunning}); // デバッグ用
            // 無効な場所をクリックした場合は選択キャンセル
            cancelSelection();
        }
        // ★ 操作説明を更新
        updateInstructionText();
    }
    // --- 札を選択中でない場合 (1回目のクリック) ---
    else {
        const clickedFuda = clickedElement.closest('.fuda');

        // クリックされたのが札で、かつ相手陣の札ではないか？
        const isInManualSetup = jiJinField.classList.contains('manual-setup');
        const isTimerRunning = currentGameTimer !== null;

        // 手動設定中、またはタイマー作動中のみ札を選択可能
        if (clickedFuda && !clickedFuda.closest('#tekiJin') && (isInManualSetup || isTimerRunning)) {
             // 暗記練習モード中は選択不可 (handleFlipClickが処理)
            if (clickedFuda.classList.contains('back')) {
                 return;
            }

            selectedFuda = clickedFuda;
            originalParent = selectedFuda.parentElement; // ★ 元の親を記録

            // 札をカーソル追従モードにする
            selectedFuda.style.position = 'absolute';
            selectedFuda.style.left = `${e.pageX + 5}px`;
            selectedFuda.style.top = `${e.pageY + 5}px`;
            selectedFuda.classList.add('selected');

            // カーソル追従を開始
            document.body.addEventListener('mousemove', followCursor);
             // ★ 操作説明を更新
             updateInstructionText();
        }
    }
}

// 4b. ★ カーソル追従関数
function followCursor(e) {
    if (selectedFuda) {
        selectedFuda.style.left = `${e.pageX + 5}px`;
        selectedFuda.style.top = `${e.pageY + 5}px`;
    }
}

// 4c. ★ 選択キャンセル関数 (修正版)
function cancelSelection() {
    if (selectedFuda && originalParent) { // 元の親が記録されていれば
        selectedFuda.style.position = '';
        selectedFuda.style.left = '';
        selectedFuda.style.top = '';
        selectedFuda.classList.remove('selected');

        // 元の親要素の適切な位置に戻す（appendChildで末尾に追加）
        originalParent.appendChild(selectedFuda); // ★ 元の場所に戻す

        selectedFuda = null;
        originalParent = null; // ★ リセット
        document.body.removeEventListener('mousemove', followCursor);
        // console.log("Selection Cancelled");
    } else if (selectedFuda) { // originalParentが不明な場合（エラーケース）
         // 選択状態だけ解除
         selectedFuda.style.position = '';
         selectedFuda.style.left = '';
         selectedFuda.style.top = '';
         selectedFuda.classList.remove('selected');
         // 元のDOMツリーから削除されてしまっている可能性があるので、手札に戻す
         if(temaeFudaArea) temaeFudaArea.appendChild(selectedFuda);
         selectedFuda = null;
         originalParent = null;
         document.body.removeEventListener('mousemove', followCursor);
         // console.warn("Selection Cancelled, original parent was unknown. Moved to temaeFuda.");
    }
     // ★ 操作説明を更新
     updateInstructionText();
}


// 4d. ★ マウスX座標に基づいて、挿入すべき位置（の次の要素）を見つける関数 (修正版)
function getInsertBeforeElement(container, x) {
    const children = [...container.querySelectorAll('.fuda:not(.selected)')]; // 選択中の札以外

    // ★ .find() を使って、クリック位置(x)より右側にある最初の要素を見つける
    const elementToInsertBefore = children.find(child => {
        const box = child.getBoundingClientRect();
        // クリック位置が、要素の中心より左側にあれば、その要素の前に挿入
        return x < box.left + box.width / 2;
    });

    return elementToInsertBefore; // 見つからなければ undefined (null相当)
}


// 4e. 手動配置完了チェック
function checkManualPlacementComplete() {
    // 手動配置モード中か確認
    if (manualArea.classList.contains('hidden')) {
        return; // 手動配置モードではない（=暗記中）なら何もしない
    }

    // 手札エリアが空になったら完了
    const fudaInTemate = temaeFudaArea.querySelectorAll('.fuda').length;

    if (fudaInTemate === 0) {
        // 完了！
        manualArea.classList.add('hidden'); // 手札エリアを隠す
        jiJinField.classList.remove('manual-setup'); // ハイライト解除

        const selectedMinutes = parseInt(timerSelect.value);
        startTimer(selectedMinutes * 60);
    }
}


// 5. タイマー開始
function startTimer(duration) {
    if (currentGameTimer) {
        clearInterval(currentGameTimer);
    }
    timerSelect.disabled = true;

    // ★ 操作説明を更新
    updateInstructionText("暗記中 (札をクリックで選択、再度クリックで配置)");

    let timer = duration;
    currentGameTimer = setInterval(() => {
        const minutes = Math.floor(timer / 60);
        const seconds = timer % 60;

        timerDisplay.textContent = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

        if (--timer < 0) {
            clearInterval(currentGameTimer);
            currentGameTimer = null; // タイマー終了を明確化
            timerDisplay.textContent = "暗記終了！";
            timerSelect.disabled = false;
            enterPracticeMode(); // 暗記練習モードへ
        }
    }, 1000);
}

// 6. 暗記練習モード
function enterPracticeMode() {
    // 選択中の札があればキャンセル
    cancelSelection();

    // 陣地にあるすべての札を取得
    const allBaFuda = document.querySelectorAll('#jiJin .fuda, #tekiJin .fuda');

    allBaFuda.forEach(fuda => {
        fuda.classList.add('back'); // 札を裏返す
        fuda.style.cursor = 'pointer';

        // クリックで裏返す処理は handleFlipClick 内で行う
    });

     // 暗記練習モード中は、配置のためのクリックリスナーを一時的に無効化
     document.body.removeEventListener('click', handleFieldClick);
     // 裏返すための専用リスナーを追加 (イベント委譲)
     document.body.addEventListener('click', handleFlipClick);

     // ★ 操作説明を更新
     updateInstructionText("暗記練習中 (裏向きの札をクリックで確認)");

}

// 6b. ★ 裏返すためのクリックハンドラ
function handleFlipClick(e) {
     // タイマーが動いていない（暗記練習モード中）か確認
     if (currentGameTimer === null) {
         const clickedFuda = e.target.closest('.fuda.back'); // 裏向きの札のみ対象
         if (clickedFuda) {
             clickedFuda.classList.toggle('back');
         }
     }
}

// ★ 操作説明更新関数
function updateInstructionText(customText = null) {
    const textElement = document.getElementById('instructionText'); // 再取得
    if (!textElement) return; // 要素がなければ何もしない

    if (customText) {
        textElement.textContent = customText;
        return;
    }

    const isInManualSetup = jiJinField.classList.contains('manual-setup');
    const isTimerRunning = currentGameTimer !== null;

    if (selectedFuda) {
        textElement.textContent = "配置したい場所をクリックしてください (無効な場所クリックでキャンセル)";
    } else if (isInManualSetup) {
        textElement.textContent = "手札の札をクリックして選択し、自陣または手札に戻したい場所をクリックして配置してください";
    } else if (isTimerRunning) {
        textElement.textContent = "自陣の札をクリックして選択し、移動させたい場所をクリックして配置してください";
    } else {
        textElement.textContent = "「開始」ボタンを押してください";
    }
}


// --- 空札表示用の関数 ---

// 空札の表示/非表示を切り替える
function toggleKaraFudaVisibility() {
    const isNowHidden = karaFudaList.classList.toggle('hidden');

    if (!isNowHidden && karaFudaList.innerHTML === '') {
        if (currentKaraFudaIds.length > 0) {
            displayKaraFuda(currentKaraFudaIds);
        } else {
            karaFudaList.innerHTML = '<p>まだ試合が開始されていません。</p>';
        }
    }
}

// 空札を表示（番号順の札画像）
function displayKaraFuda(fudaIds) {
    karaFudaList.innerHTML = '';

    const karaFudaHeader = document.querySelector('#toggleKaraFuda').parentElement;
    if (karaFudaHeader && karaFudaHeader.firstChild.nodeType === Node.TEXT_NODE) {
       karaFudaHeader.firstChild.textContent = `空札 (${fudaIds.length}枚) `;
    }

    const karaFudaData = fudaIds
        .map(id => allKarutaData.find(fuda => fuda.id === id))
        .filter(fuda => fuda)
        .sort((a, b) => a.id - b.id);

    karaFudaData.forEach(fuda => {
        const fudaElement = createFudaElement(fuda);
        fudaElement.style.transform = 'none';
        fudaElement.style.cursor = 'default';
        karaFudaList.appendChild(fudaElement);
    });
}


// --- ユーティリティ関数 ---

// 札のHTML要素を作成
function createFudaElement(fuda) {
    const div = document.createElement('div');
    div.className = 'fuda';
    div.style.backgroundImage = `url('${fuda.image_path}')`;
    div.dataset.id = fuda.id;
    // draggable は削除

    div.title = `[${fuda.id}] ${fuda.kami}\n${fuda.shimo}`;

    return div;
}

// --- 起動 ---
initialize();