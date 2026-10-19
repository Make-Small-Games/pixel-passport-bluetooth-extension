// Add Browser Events and Sprite Data, and paste the extension code in custom.ts.
PixelPassportBluetooth.onMonsterReceived(function () {
    // Demo only: show one at a time.
    if (My_Monster) {
        sprites.destroy(My_Monster)
    }
    My_Monster = PixelPassportBluetooth.createMonster(SpriteKind.Player)
    if (My_Monster) {
        My_Monster.setPosition(80, 60)
        My_Monster.setScale(3, ScaleAnchor.Middle)
    }
    console.log("Received Pixel Passport monster: " + PixelPassportBluetooth.monsterType())
    console.log("Attack: " + sprites.readDataNumber(My_Monster, "Monster Attack"))
})
PixelPassportBluetooth.onMonsterError(function () {
    console.log("Pixel Passport scan failed: " + PixelPassportBluetooth.lastError())
})
/**
 * Pixel Passport Bluetooth v0.3 test game.
 */
let My_Monster: Sprite = null
PixelPassportBluetooth.showLoadingBar(true)
PixelPassportBluetooth.showKeyWarning(true)
PixelPassportBluetooth.startReceiver()
