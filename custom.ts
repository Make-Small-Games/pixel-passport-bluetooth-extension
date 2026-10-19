/**
 * Pixel Passport (Bluetooth) Extension
 * Requires MakeCode Arcade Browser Events and Sprite Data extensions.
 *
 * NFC card format (unchanged): 269 characters
 * 0-255: 16x16 image (hex pixels 0-F)
 * 256: facing (L/F/R)
 * 257: type (0-9/A-Z)
 * 258-260: health, attack, speed (base36)
 * 261-268: reserved
 *
 * Bluetooth HID transmission format (NEW):
 *   PPSTART + 269-character card data + 4-character CRC-16 (base36)
 * Enter keys between portions are ignored by Browser Events.
 * Both micro:bit sender and Arcade receiver must use this protocol.
 */
//% color="#38BDF8" weight=90 icon="\uf294" block="Pixel Passport"
namespace PixelPassportBluetooth {
    const TOTAL = 269
    const CRC_LENGTH = 4
    const START_MARKER = "PPSTART"
    const PIXELS = "0123456789ABCDEF"
    const CODES = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    const FACINGS = "LFR"

    let started = false
    let state = 0 // 0 waiting, 1 receiving, 2 complete, 3 error
    let startBuffer = ""
    let incoming = "" // card data followed by 4-character CRC
    let lastMonsterCode = "" // preserved even when another scan starts/fails
    let lastKeyTime = 0
    let errorText = ""
    let drawLoadingBar = true
    let drawKeyWarning = false
    let receivedHandler: () => void = null
    let errorHandler: () => void = null
    let spriteArt = image.create(16, 16)
    let facing = ""
    let typeCode = ""
    let health = 0
    let attack = 0
    let speed = 0
    let reserved = ""

    // Keep this order matched to CODES (0-9 followed by A-Z).
    const keys = [
        browserEvents.Zero, browserEvents.One, browserEvents.Two,
        browserEvents.Three, browserEvents.Four, browserEvents.Five,
        browserEvents.Six, browserEvents.Seven, browserEvents.Eight,
        browserEvents.Nine, browserEvents.A, browserEvents.B,
        browserEvents.C, browserEvents.D, browserEvents.E,
        browserEvents.F, browserEvents.G, browserEvents.H,
        browserEvents.I, browserEvents.J, browserEvents.K,
        browserEvents.L, browserEvents.M, browserEvents.N,
        browserEvents.O, browserEvents.P, browserEvents.Q,
        browserEvents.R, browserEvents.S, browserEvents.T,
        browserEvents.U, browserEvents.V, browserEvents.W,
        browserEvents.X, browserEvents.Y, browserEvents.Z
    ]

    // CRC-16/CCITT-FALSE: matches the micro:bit Bluetooth sender.
    function checksum(monsterData: string): string {
        let crc = 65535
        for (let i = 0; i < monsterData.length; i++) {
            crc = crc ^ (monsterData.charCodeAt(i) << 8)
            for (let bit = 0; bit < 8; bit++) {
                if ((crc & 32768) != 0) {
                    crc = ((crc << 1) ^ 4129) & 65535
                } else {
                    crc = (crc << 1) & 65535
                }
            }
        }
        let result = ""
        for (let digit = 0; digit < CRC_LENGTH; digit++) {
            result = CODES.charAt(crc % 36) + result
            crc = Math.idiv(crc, 36)
        }
        return result
    }

    function fail(message: string) {
        errorText = message
        state = 3
        startBuffer = ""
        console.log("Pixel Passport: " + message + " (received " + incoming.length + " characters)")
        if (errorHandler) errorHandler()
    }

    function decodeMonster(monsterData: string) {
        for (let i = 0; i < 256; i++) {
            if (PIXELS.indexOf(monsterData.charAt(i)) < 0) {
                fail("INVALID SPRITE")
                return
            }
        }
        if (FACINGS.indexOf(monsterData.charAt(256)) < 0) {
            fail("INVALID FACING")
            return
        }
        for (let i = 257; i < TOTAL; i++) {
            if (CODES.indexOf(monsterData.charAt(i)) < 0) {
                fail("INVALID DATA")
                return
            }
        }

        // Only replace the previous monster after full validation.
        let nextArt = image.create(16, 16)
        for (let i = 0; i < 256; i++) {
            nextArt.setPixel(i % 16, Math.idiv(i, 16),
                PIXELS.indexOf(monsterData.charAt(i)))
        }
        spriteArt = nextArt
        facing = monsterData.charAt(256)
        typeCode = monsterData.charAt(257)
        health = CODES.indexOf(monsterData.charAt(258))
        attack = CODES.indexOf(monsterData.charAt(259))
        speed = CODES.indexOf(monsterData.charAt(260))
        reserved = monsterData.substr(261, 8)
        lastMonsterCode = monsterData
        errorText = ""
        state = 2
        if (receivedHandler) receivedHandler()
    }

    function beginScan() {
        incoming = ""
        startBuffer = ""
        errorText = ""
        lastKeyTime = game.runtime()
        state = 1
    }

    // Wait for the full start marker before capturing card data.
    // Other gameplay key presses will not start the loading screen.
    function listenForStart(letter: string) {
        startBuffer += letter
        // Keep the longest suffix that could be the beginning of PPSTART.
        while (startBuffer.length > 0 &&
            START_MARKER.substr(0, startBuffer.length) != startBuffer) {
            startBuffer = startBuffer.substr(1)
        }
        if (startBuffer == START_MARKER) beginScan()
    }

    function receiveCharacter(letter: string) {
        if (state != 1) {
            listenForStart(letter)
            return
        }
        incoming += letter
        lastKeyTime = game.runtime()
        if (incoming.length == TOTAL + CRC_LENGTH) {
            let cardCode = incoming.substr(0, TOTAL)
            let providedCRC = incoming.substr(TOTAL, CRC_LENGTH)
            if (providedCRC != checksum(cardCode)) {
                fail("CHECKSUM FAILED")
            } else {
                decodeMonster(cardCode)
            }
        }
    }

    // Named registration retains the correct index in each handler.
    function registerKey(index: number) {
        keys[index].onEvent(browserEvents.KeyEvent.Pressed, function () {
            receiveCharacter(CODES.charAt(index))
        })
    }

    function showProgress() {
        if (state != 1 || (!drawLoadingBar && !drawKeyWarning)) return
        screen.fill(1)
        if (drawLoadingBar) {
            screen.fillRect(13, 55, 134, 16, 15)
            screen.fillRect(15, 57, 130, 12, 1)
            let progress = incoming.length
            if (progress > TOTAL) progress = TOTAL
            screen.fillRect(15, 57, Math.idiv(progress * 130, TOTAL), 12, 7)
            let count = "" + progress + " / 269"
            screen.print(count, Math.idiv(160 - count.length * 6, 2), 80, 15)
        }
        if (drawKeyWarning && Math.idiv(game.runtime(), 500) % 2 == 0) {
            screen.print("DO NOT TOUCH KEYS", 29, 99, 2)
        }
    }

    /** Start listening for Bluetooth keyboard input. Call once at game start. */
    //% block="start Bluetooth receiver"
    //% weight=100
    export function startReceiver() {
        if (started) return
        started = true
        for (let i = 0; i < keys.length; i++) registerKey(i)
        game.onUpdateInterval(250, function () {
            if (state == 1 && game.runtime() - lastKeyTime > 8000) {
                fail("SCAN TIMED OUT")
            }
        })
        game.onPaint(function () {
            showProgress()
        })
    }

    /** Run when a full, valid monster has been received. */
    //% block="on monster received"
    //% weight=95
    export function onMonsterReceived(handler: () => void) {
        receivedHandler = handler
    }

    /** The most recently received monster's original 16x16 image. */
    //% block="monster image"
    //% weight=90
    export function monsterImage(): Image {
        return spriteArt.clone()
    }

    /** Create a sprite and attach its type, facing and stats with Sprite Data. */
    //% block="create Pixel Passport monster of kind $kind"
    //% kind.shadow="spritekind"
    //% blockSetVariable=My_Monster
    //% weight=88
    export function createMonster(kind: number): Sprite {
        if (typeCode == "") return null
        let monster = sprites.create(spriteArt.clone(), kind)
        sprites.setDataString(monster, "Monster Type", typeCode)
        sprites.setDataString(monster, "Monster Facing", facing)
        sprites.setDataNumber(monster, "Monster Health", health)
        sprites.setDataNumber(monster, "Monster Attack", attack)
        sprites.setDataNumber(monster, "Monster Speed", speed)
        sprites.setDataString(monster, "Monster Reserved", reserved)
        return monster
    }

    /** One-character monster type. */
    //% block="monster type"
    //% weight=85
    export function monsterType(): string { return typeCode }

    /** Monster facing: L, F, or R. */
    //% block="monster facing"
    //% weight=80
    export function monsterFacing(): string { return facing }

    /** Monster health (0-35). */
    //% block="monster health"
    //% weight=75
    export function monsterHealth(): number { return health }

    /** Monster attack (0-35). */
    //% block="monster attack"
    //% weight=70
    export function monsterAttack(): number { return attack }

    /** Monster speed (0-35). */
    //% block="monster speed"
    //% weight=65
    export function monsterSpeed(): number { return speed }

    /** Whether a character is currently being transferred. */
    //% block="monster is loading"
    //% weight=60
    export function isLoading(): boolean { return state == 1 }

    /** Show or hide the progress bar during a scan. Enabled by default. */
    //% block="show loading bar $enabled"
    //% enabled.shadow="toggleOnOff"
    //% weight=55
    export function showLoadingBar(enabled: boolean) {
        drawLoadingBar = enabled
    }

    /** Flash DO NOT TOUCH KEYS under the loading bar (off by default). */
    //% block="show do not touch keys warning $enabled"
    //% enabled.shadow="toggleOnOff"
    //% weight=50
    export function showKeyWarning(enabled: boolean) {
        drawKeyWarning = enabled
    }

    /** Run when a scan times out, is corrupted or is invalid. */
    //% block="on monster scan error"
    //% weight=40 advanced=true
    export function onMonsterError(handler: () => void) {
        errorHandler = handler
    }

    /** Most recent scan error. */
    //% block="monster scan error text"
    //% weight=35 advanced=true
    export function lastError(): string { return errorText }

    /** Eight reserved future-use characters. */
    //% block="monster reserved data"
    //% weight=30 advanced=true
    export function monsterReserved(): string { return reserved }

    /** The last successfully received card's original 269-character code. */
    //% block="monster raw code"
    //% weight=25 advanced=true
    export function rawCode(): string { return lastMonsterCode }
}
