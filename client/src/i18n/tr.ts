import type { Dictionary } from './en';

/**
 * The interface copy, in Turkish.
 *
 * Typed as Dictionary, so a key missing here - or one spelled differently from
 * en.ts - is a build failure rather than an English sentence appearing in a Turkish
 * screen. Adding a key to en.ts and not this file will not compile. That is
 * deliberate.
 *
 * The English copy is written in plain, warm, complete sentences rather than
 * labels; the Turkish follows the same voice rather than the same word order.
 */
export const tr: Dictionary = {
    // App ---------------------------------------------------------------------
    'app.title': 'UUP — Stok',

    // Bottom navigation -------------------------------------------------------
    'nav.home': 'Ana sayfa',
    'nav.products': 'Ürünler',
    'nav.scan': 'Tara',
    'nav.invoices': 'Faturalar',
    'nav.settings': 'Ayarlar',

    // Shared controls and blocks ----------------------------------------------
    'common.loading': 'Yükleniyor…',
    'common.tryAgain': 'Tekrar dene',
    'common.cancel': 'Vazgeç',
    'common.close': 'Kapat',
    'common.continue': 'Devam et',
    'common.save': 'Kaydet',
    'common.back': 'Geri',
    'common.optional': 'İsteğe bağlı',
    'common.decreaseByOne': 'Bir azalt',
    'common.increaseByOne': 'Bir artır',

    'common.and': 've',

    // Dates -------------------------------------------------------------------
    'date.today': 'Bugün',
    'date.yesterday': 'Dün',

    // Price chart -------------------------------------------------------------
    // "Alış fiyatı" rather than the literal "maliyet": what this actually holds is
    // what the shop paid its supplier, which is how a shopkeeper says it.
    'chart.sellingPrice': 'Satış fiyatı',
    'chart.cost': 'Alış fiyatı',
    'chart.ariaLabel':
        'Zaman içinde {series}. Tüm rakamlar grafiğin altında listelenmiştir.',
    'chart.caption':
        'Bir fiyat siz değiştirene kadar geçerli kalır; bu yüzden çizgi eğim değil basamak yapar.',

    // Stock pill --------------------------------------------------------------
    'stock.none': 'Kalmadı',
    'stock.left': '{count} kaldı',

    // Turkish takes no plural after a numeral - "3 ürün", never "3 ürünler" - so
    // both forms are identical. They are still both written out: the shared key
    // shape is what lets tsc check the file, and the repetition documents itself.
    'count.product_one': '{count} ürün',
    'count.product_other': '{count} ürün',
    'count.supplier_one': '{count} tedarikçi',
    'count.supplier_other': '{count} tedarikçi',
    'count.invoice_one': '{count} fatura',
    'count.invoice_other': '{count} fatura',
    'count.item_one': 'adet',
    'count.item_other': 'adet',

    // Camera ------------------------------------------------------------------
    'camera.insecure':
        'Kamera yalnızca güvenli bağlantıda çalışır. Bu sayfa {origin} adresinden açıldı, bu yüzden tarayıcı kamera erişimini engelliyor. https kullanın ya da uygulamayı bu bilgisayarda localhost adresinden açın.',
    'camera.unsupported':
        'Bu tarayıcı kamerayı kullanamıyor. Bunun yerine barkodu elle yazabilirsiniz.',
    'camera.denied':
        'Kamera izni verilmedi. Tarayıcı ayarlarınızdan bu siteye kamera erişimi verip tekrar deneyin.',
    'camera.notFound': 'Bu cihazda kamera bulunamadı.',
    'camera.inUse': 'Kamera başka bir uygulama tarafından kullanılıyor. Onu kapatıp tekrar deneyin.',
    'camera.constraints': 'Bu kamera istenen görüntü ayarlarını desteklemiyor.',
    'camera.failed': 'Kamera başlatılamadı. Bunun yerine barkodu elle yazabilirsiniz.',

    // Sign in -----------------------------------------------------------------
    'auth.welcome': 'Tekrar hoş geldiniz',
    'auth.subtitle': 'Hesabınıza girmek için oturum açın',
    'auth.username': 'Kullanıcı adı',
    'auth.password': 'Parola',
    'auth.signingIn': 'Giriş yapılıyor…',
    'auth.signIn': 'Giriş yap',
    'auth.signedIn': 'Giriş yapıldı',
    'auth.signInFailed': 'Giriş yapılamadı.',

    // Settings ----------------------------------------------------------------
    'settings.title': 'Ayarlar',
    'settings.subtitle': 'Hesabınız ve uygulama bilgileri.',
    'settings.language': 'Dil',
    'settings.signedInAs': 'Giriş yapan',
    'settings.notSignedIn': 'Giriş yapılmadı',
    'settings.appName': 'UUP stok',
    'settings.suppliers': 'Tedarikçiler',
    'settings.suppliersHint': 'Mal aldığınız firmaları ekleyin, adını değiştirin ya da silin',
    'settings.connection': 'Bağlantı',
    'settings.checking': 'Kontrol ediliyor…',
    'settings.connected': 'Bağlı',
    'settings.connectedHint':
        'Değişiklikleriniz kaydediliyor ve bu dükkânı kullanan herkesle paylaşılıyor.',
    'settings.notConnected': 'Bağlantı yok',
    'settings.notConnectedHint':
        'Uygulama sunucuya ulaşamıyor, bu yüzden değişiklikler kaydedilmeyecek. İnternet bağlantınızı kontrol edip tekrar deneyin.',
    'settings.signOut': 'Çıkış yap',
    'settings.footer': 'Şirket içi araç • Yalnızca yetkili personel',

    // Home --------------------------------------------------------------------
    'home.title': 'Bugün',
    'home.checking': 'Dükkânınıza bakılıyor…',
    'home.nothingNeeds': 'İlgilenmeniz gereken bir şey yok.',
    'home.needsAttention_one': '{count} şey ilginizi bekliyor',
    'home.needsAttention_other': '{count} şey ilginizi bekliyor',
    'home.allClear': 'Her şey stokta, fiyatlı ve güncel.',
    'home.rowClear': 'Sorun yok',
    'home.scan': 'Tara',
    'home.addProduct': 'Ürün ekle',
    'home.recentChanges': 'Son değişiklikler',
    'home.signal.belowCost.label': 'Aldığından ucuza satılanlar',
    'home.signal.belowCost.detail': 'Bunların her satışı zarar ettiriyor.',
    'home.signal.low.label': 'Stoğu azalanlar',
    'home.signal.low.labelWithZero': 'Stoğu azalanlar — {count} tanesi bitti',
    'home.signal.low.detail': '{threshold} veya daha az kaldı.',
    'home.signal.invoices.label': 'İncelenecek faturalar',
    'home.signal.invoices.detail':
        'Yüklendi, ama stokları ve alış fiyatları henüz kaydedilmedi.',
    'home.signal.noPrice.label': 'Satış fiyatı olmayanlar',
    'home.signal.noPrice.detail':
        'Satış fiyatı olmadan bu uygulama bunlardan ne kazandığınızı söyleyemez.',
    'home.signal.costRose.label': 'Alışı değişti, satışı değişmedi',
    'home.signal.costRose.detail': 'Siz fiyatınızı belirledikten sonra ödediğiniz tutar arttı.',
    'home.activity.stock': 'Stok {direction}',
    'home.activity.stockDetail': 'Stok {direction} — {detail}',
    'home.activity.price': '{what} {amount} olarak ayarlandı',

    // Product list ------------------------------------------------------------
    'product.list.title': 'Ürünler',
    'product.list.add': 'Ekle',
    'product.list.showingOnly': 'Yalnızca {filter} gösteriliyor',
    'product.list.showAll': 'Tümünü göster',
    'product.list.searchPlaceholder': 'Ada, barkoda veya markaya göre ara',
    'product.list.searchLabel': 'Ürünlerde ara',
    'product.list.loading': 'Ürünler yükleniyor…',
    'product.list.nothingLeft': 'Burada bir şey kalmadı',
    'product.list.showAllProducts': 'Tüm ürünleri göster',
    'product.list.noMatch': 'Bu aramayla eşleşen bir şey yok',
    'product.list.noMatchHint': 'Adın bir bölümünü ya da farklı bir yazımı deneyin.',
    'product.list.empty': 'Henüz ürün yok',
    'product.list.emptyHint':
        'Neyiniz olduğunu ve ne ettiğini takip etmeye başlamak için ilk ürününüzü ekleyin.',
    'product.list.addProduct': 'Ürün ekle',
    'product.sellsFor': 'Satış',
    'product.costsYou': 'Alış',

    // Product subsets the home screen links into ------------------------------
    'filter.low.title': 'Stoğu azalanlar',
    'filter.low.inline': 'stoğu azalanlar',
    'filter.low.empty': 'Stoğu azalan bir şey yok.',
    'filter.noPrice.title': 'Satış fiyatı olmayanlar',
    'filter.noPrice.inline': 'satış fiyatı olmayanlar',
    'filter.noPrice.empty': 'Her ürünün bir satış fiyatı var.',
    'filter.costRose.title': 'Alışı değişti, satışı değişmedi',
    'filter.costRose.inline': 'alış fiyatı değişenler',
    'filter.costRose.empty': 'Fiyatlarınızı belirledikten sonra hiçbir alış fiyatı değişmedi.',
    'filter.belowCost.title': 'Aldığından ucuza satılanlar',
    'filter.belowCost.inline': 'aldığından ucuza satılanlar',
    'filter.belowCost.empty': 'Aldığından ucuza fiyatlanmış bir şey yok.',

    // Scan --------------------------------------------------------------------
    'scan.title': 'Ürün bul',
    'scan.subtitle': 'Barkodunu kamerayla okutun ya da numarasını yazın.',
    'scan.looking': 'Aranıyor…',
    'scan.withCamera': 'Kamerayla tara',
    'scan.manualLabel': 'Ya da barkodu yazın',
    'scan.manualHint': 'Kamera çalışmadığında da işe yarar.',
    'scan.manualPlaceholder': 'Örneğin 8693240002044',
    'scan.find': 'Ürünü bul',
    'scan.dialogTitle': 'Ürün tara',
    'scan.unknownTitle': 'Bu barkod henüz listenizde yok',
    'scan.youScanned': 'Okuttuğunuz barkod',
    'scan.unknownBody':
        'Bu barkoda sahip bir ürün yok. Yeni ürün olarak ekleyebilir ya da başka bir barkod okutabilirsiniz.',
    'scan.addAsNew': 'Bunu yeni ürün olarak ekle',
    'scan.scanAnother': 'Başka bir barkod tara',

    // Barcode scanner panel ---------------------------------------------------
    'scanner.title': 'Barkod tara',
    'scanner.hint': 'Barkodu çerçevenin içinde tutun',
    'scanner.close': 'Tarayıcıyı kapat',
    'scanner.opening': 'Kamera açılıyor…',
    'scanner.anyBarcode': 'Ürünün üzerindeki herhangi bir barkod olur',

    // Invoice list ------------------------------------------------------------
    'invoice.list.title': 'Faturalar',
    'invoice.list.waiting': '{count} tanesi incelenmeyi bekliyor',
    'invoice.list.allReviewed': 'Hepsi incelendi',
    'invoice.list.upload': 'Yükle',
    'invoice.list.loading': 'Faturalar yükleniyor…',
    'invoice.list.empty': 'Henüz fatura yok',
    'invoice.list.emptyHint':
        'Bir tedarikçi faturasının fotoğrafını çekin, uygulama satırlarını sizin için okusun.',
    'invoice.list.uploadOne': 'Fatura yükle',
    'invoice.list.waitingHeading': 'Sizi bekleyenler',
    'invoice.list.doneHeading': 'Kaydedilmiş olanlar',
    'invoice.list.recorded': 'Kaydedildi',
    'invoice.list.review': 'İncele',

    // Invoice upload ----------------------------------------------------------
    'invoice.upload.title': 'Fatura yükle',
    'invoice.upload.subtitle': 'Tedarikçi faturalarından stok aktarın.',
    'invoice.upload.supplier': 'Tedarikçi',
    'invoice.upload.loadingSuppliers': 'Tedarikçiler yükleniyor…',
    'invoice.upload.selectSupplier': 'Bir tedarikçi seçin…',
    'invoice.upload.photo': 'Fatura fotoğrafı',
    'invoice.upload.uploading': 'Yükleniyor…',
    'invoice.upload.submit': 'Faturayı yükle',
    'invoice.upload.needBoth':
        'Devam etmek için bir tedarikçi ve bir fatura fotoğrafı seçin.',
    'invoice.upload.notAnImage': 'Lütfen bir resim dosyası seçin.',
    'invoice.upload.done': 'Fatura yüklendi',

    // Invoice review ----------------------------------------------------------
    'invoice.review.title': 'Faturayı incele',
    'invoice.review.reading': 'Fatura okunuyor…',
    'invoice.review.readingHint': 'Bu birkaç saniye sürer.',
    'invoice.review.reread': 'Yeniden oku',
    'invoice.review.rereadConfirm':
        'Fatura yeniden okunsun mu? Bu ekranda yaptığınız değişikliklerin yerini yeni okuma alacak.',
    'invoice.review.rereadDone': 'Fatura yeniden okundu',
    'invoice.review.draftSaving': 'Kaydediliyor…',
    'invoice.review.draftSaved': 'Değişiklikler kaydedildi',
    'invoice.review.draftFailed': 'Değişiklikler kaydedilmedi',
    'invoice.review.draftRestored': 'Değişiklikler geri yüklendi',
    'invoice.review.draftRestoredToast': 'Kaldığınız yerden devam ediyorsunuz ({when})',
    'invoice.review.wentWrong': 'Bir şeyler ters gitti',
    'invoice.review.notFound': 'Fatura bulunamadı',
    'invoice.review.backToUpload': 'Yüklemeye dön',
    'invoice.review.supplier': 'Tedarikçi',
    'invoice.review.onDocument': 'Belgede: {name}',
    'invoice.review.date': 'Tarih',
    'invoice.review.unknownDate': 'Bilinmiyor',
    'invoice.review.lineItems': 'Fatura satırları ({count})',
    'invoice.review.addLine': 'Satır ekle',
    'invoice.review.removeConfirm': 'Bu satır kaldırılsın mı?',
    'invoice.review.selected_one': '{count} satır seçildi',
    'invoice.review.selected_other': '{count} satır seçildi',
    'invoice.review.applying': 'Uygulanıyor…',
    'invoice.review.apply': 'Faturayı uygula',
    'invoice.review.applied_one': 'Fatura uygulandı. {count} satır güncellendi.',
    'invoice.review.applied_other': 'Fatura uygulandı. {count} satır güncellendi.',
    'invoice.review.needProduct_one': 'Seçili {count} satır için bir ürün seçin.',
    'invoice.review.needProduct_other': 'Seçili {count} satır için bir ürün seçin.',

    // Invoice review, one line -------------------------------------------------
    'invoice.line.newItem': 'Yeni satır',
    'invoice.line.remove': 'Bu satırı kaldır',
    'invoice.line.code': 'Kod: {code}',
    'invoice.line.barcodeTag': 'Barkod: {barcode}',
    'invoice.line.itemName': 'Ürün adı',
    'invoice.line.itemNamePlaceholder': 'Ürün adı',
    'invoice.line.brand': 'Marka (isteğe bağlı)',
    'invoice.line.brandPlaceholder': 'Marka',
    'invoice.line.barcode': 'Barkod',
    'invoice.line.scan': 'Tara',
    'invoice.line.scanTitle': 'Ürünü eşleştirmek için tara',
    'invoice.line.barcodePlaceholder': 'Barkodu okutun ya da yazın',
    'invoice.line.matchedProduct': 'Eşleşen ürün',
    'invoice.line.creating': 'Oluşturuluyor…',
    'invoice.line.createNew': 'Yeni oluştur',
    'invoice.line.noMatch': 'Eşleşen ürün yok',
    'invoice.line.change': 'Değiştir',
    'invoice.line.select': 'Seç',
    'invoice.line.searchPlaceholder': 'Ürünlerde ara…',
    'invoice.line.searching': 'Aranıyor…',
    'invoice.line.noResults': 'Ürün bulunamadı',
    'invoice.line.quantity': 'Miktar',
    'invoice.line.unitPrice': 'Birim fiyat (KDV hariç)',
    'invoice.line.updateStock': 'Stok miktarını güncelle',
    'invoice.line.updatePrice': 'Alış fiyatını güncelle',
    'invoice.line.badgeNone': 'Ürün yok',
    'invoice.line.badgeHigh': 'Güçlü eşleşme',
    'invoice.line.badgeMedium': 'Orta eşleşme',
    'invoice.line.badgeLow': 'Zayıf eşleşme',
    'invoice.line.matched': '{name} ile eşleştirildi',
    'invoice.line.noBarcodeMatch': '{barcode} barkodlu bir ürün yok',
    'invoice.line.nameRequired': 'Ürün oluşturmak için bir ad gerekli.',
    'invoice.line.created': 'Ürün oluşturuldu',
    'invoice.line.mismatch':
        'Miktar × birim fiyat, faturadaki satır toplamıyla ({total}) uyuşmuyor. Uygulamadan önce rakamları kontrol edin.',

    // Supplier dialog ---------------------------------------------------------
    'supplier.dialog.newTitle': 'Yeni tedarikçi',
    'supplier.dialog.renameTitle': 'Tedarikçiyi yeniden adlandır',
    'supplier.dialog.confirmAdd': 'Bu tedarikçi eklensin mi?',
    'supplier.dialog.confirmRename': 'Bu tedarikçinin adı değiştirilsin mi?',
    'supplier.dialog.currentlyCalled': 'Şu anki adı',
    'supplier.dialog.willBeRenamed': 'Yeni adı',
    'supplier.dialog.willBeSaved': 'Şu şekilde kaydedilecek',
    'supplier.dialog.renameNote':
        'Bu tedarikçiye bağlı ürünler bağlı kalmaya devam eder.',
    'supplier.dialog.addNote': 'Bu tedarikçiyi herhangi bir üründe seçebileceksiniz.',
    'supplier.dialog.saving': 'Kaydediliyor…',
    'supplier.dialog.yesRename': 'Evet, adını değiştir',
    'supplier.dialog.yesAdd': 'Evet, tedarikçiyi ekle',
    'supplier.dialog.goBack': 'Geri dön ve düzenle',
    'supplier.dialog.nameLabel': 'Tedarikçi adı',
    'supplier.dialog.nameHint': 'Mal aldığınız firma.',
    'supplier.dialog.namePlaceholder': 'Örneğin: Yıldız Ambalaj',
    'supplier.dialog.checking': 'Listeniz kontrol ediliyor…',
    'supplier.dialog.taken': '{name} zaten listenizde.',
    'supplier.dialog.takenNote': 'Büyük harf kullanmak farklı bir tedarikçi yapmaz.',
    'supplier.dialog.use': '{name} kullan',
    'supplier.dialog.similar_one':
        'Neredeyse aynı adlı bir tedarikçiniz zaten var. Aynı firma mı?',
    'supplier.dialog.similar_other':
        'Neredeyse aynı adlı tedarikçileriniz zaten var. Bunlardan biri mi?',
    'supplier.dialog.noChange': 'Henüz bir değişiklik yok',

    // Product form, shared by Add and Edit -------------------------------------
    'product.form.whatIsIt': 'Bu ürün ne?',
    'product.form.name': 'Ürün adı',
    'product.form.namePlaceholder': 'Örneğin: 1 kg toz şeker',
    'product.form.barcode': 'Barkod',
    'product.form.barcodeHint': 'Eklerseniz bu ürünü sonra barkodunu okutarak bulabilirsiniz.',
    'product.form.barcodePlaceholder': 'Numarayı yazın ya da okutun',
    'product.form.scan': 'Tara',
    'product.form.scanTitle': 'Ürünün barkodunu tara',
    'product.form.openInstead': 'Onun yerine o ürünü aç',
    'product.form.brand': 'Marka',
    'product.form.supplier': 'Tedarikçi',
    'product.form.supplierHint': 'Kimden aldığınız.',
    'product.form.notSet': 'Seçilmedi',
    'product.form.newSupplier': 'Yeni',
    'product.form.usingSupplier': '{name} kullanılıyor',
    'product.form.stockSection': 'Elinizde kaç tane var?',
    'product.form.stockHint':
        'Şu anda rafta olanı sayın. İstediğiniz zaman düzeltebilirsiniz.',
    'product.form.quantity': 'Stoktaki miktar',
    'product.form.pricesSection': 'Fiyatlar',
    'product.form.pricesHint': 'Henüz bilmiyorsanız ikisini de boş bırakabilirsiniz.',
    'product.form.cost': 'Alış fiyatı',
    'product.form.costHint': 'Bir tanesi için tedarikçinize ödediğiniz tutar.',
    'product.form.sell': 'Satış fiyatı',
    'product.form.sellHint': 'Müşterinizin bir tanesi için ödediği tutar.',
    'product.form.priceDate': 'Bu fiyatların geçerli olduğu tarih',
    'product.form.priceDateHint':
        'Geçmiş bir faturadan eski bir fiyat giriyorsanız bu tarihi değiştirin.',

    // Shared profit copy. Written once, shown on Add, Edit and the detail screen.
    'product.profit.positive':
        'Her birinden {amount} kazanıyorsunuz (satış fiyatının {margin} kadarı).',
    'product.profit.negative':
        'Dikkat: bu ürün size mal olduğundan {amount} daha ucuza satılıyor.',

    // Product form validation --------------------------------------------------
    'product.error.nameRequired': 'Lütfen ürüne bir ad verin.',
    'product.error.barcodeTaken':
        'Bu barkodu zaten {name} kullanıyor. Barkodu silin ya da o ürünü açın.',
    'product.error.amount': 'Bir tutar girin, örneğin {example}.',
    'product.error.wholeNumber': 'Tam sayı girin.',
    'product.error.negativeQuantity': 'Miktar sıfırdan küçük olamaz.',

    // Add product --------------------------------------------------------------
    'product.add.title': 'Ürün ekle',
    'product.add.subtitle':
        'Yalnızca ad gerekli. Henüz bilmediklerinizi sonra ekleyebilirsiniz.',
    'product.add.saving': 'Ekleniyor…',
    'product.add.submit': 'Ürünü ekle',
    'product.add.added': '{name} eklendi',

    // Edit product -------------------------------------------------------------
    'product.edit.title': 'Ürünü düzenle',
    'product.edit.subtitle':
        'Bilgileri değiştirin. Fiyatlar ve stok, geçmişleri korunsun diye ürün sayfasından değiştirilir.',
    'product.edit.details': 'Bilgiler',
    'product.edit.barcodeSection': 'Barkod',
    'product.edit.barcodeLockedHint':
        'Bu değiştirilemez. Ürünün üzerinde basılıdır ve burada değiştirmek ürünün okutularak bulunmasını engeller.',
    'product.edit.noBarcode': 'Kayıtlı barkod yok',
    'product.edit.loading': 'Ürün yükleniyor…',
    'product.edit.backToProducts': 'Ürünlere dön',
    'product.edit.saving': 'Kaydediliyor…',
    'product.edit.submit': 'Değişiklikleri kaydet',
    'product.edit.saved': 'Ürün güncellendi',

    // Product detail -----------------------------------------------------------
    'product.detail.edit': 'Düzenle',
    'product.detail.notFound': 'Ürün bulunamadı.',
    'product.detail.inStock': 'Stokta',
    'product.detail.since': '{date} tarihinden beri',
    'product.detail.tapToAdd': 'eklemek için dokunun',
    'product.detail.updateStock': 'Stoğu güncelle',
    'product.detail.changeCost': 'Alış fiyatını değiştir',
    'product.detail.changeSell': 'Satış fiyatını değiştir',
    'product.detail.changePrices': 'Fiyatları değiştir',
    'product.detail.chartTitle': 'Zaman içinde fiyatlar',
    'product.detail.chartHint': 'Bu ürün size kaça mal oldu ve siz kaça sattınız.',
    'product.detail.costHistory': 'Alış fiyatı geçmişi',
    'product.detail.costHistoryHint': 'Zaman içinde tedarikçinize ödedikleriniz.',
    'product.detail.costHistoryEmpty': 'Henüz alış fiyatı kaydedilmedi.',
    'product.detail.sellHistory': 'Satış fiyatı geçmişi',
    'product.detail.sellHistoryHint': 'Zaman içinde müşterilerinizden aldıklarınız.',
    'product.detail.sellHistoryEmpty': 'Henüz satış fiyatı kaydedilmedi.',
    'product.detail.now': 'Şu an',
    'product.detail.stockChanges': 'Stok hareketleri',
    'product.detail.stockChangesEmpty': 'Henüz bir kayıt yok.',
    'product.detail.stockNow': 'Stok şimdi {count}',
    'product.detail.priceSaved_one': 'Fiyat kaydedildi',
    'product.detail.priceSaved_other': 'Fiyatlar kaydedildi',

    // Update stock dialog ------------------------------------------------------
    'product.stock.howMany': 'Şu anda kaç tane var?',
    'product.stock.currently': 'Kayıtlı miktar: {count}',
    'product.stock.invalid': 'Sıfır veya daha büyük bir tam sayı girin.',
    'product.stock.thatIs': 'Bu, öncekinden {difference}.',
    'product.stock.more': '{count} fazla',
    'product.stock.fewer': '{count} az',
    'product.stock.why': 'Neden değişti?',
    'product.stock.reason.counted': 'Rafı saydım',
    'product.stock.reason.delivery': 'Yeni sevkiyat',
    'product.stock.reason.sold': 'Satıldı',
    'product.stock.reason.damaged': 'Hasar gördü',
    'product.stock.reason.returned': 'İade edildi',

    // Change prices dialog -----------------------------------------------------
    'product.price.was': 'Önceki: {previous} — {change}',
    'product.price.up': '{amount} arttı',
    'product.price.down': '{amount} azaldı',
    'product.price.markupHint': 'Ya da alış fiyatına kâr payı ekleyin:',
    'product.price.markup': '+{percent}',
    'product.price.effectiveFrom': 'Geçerlilik tarihi',
    'product.price.effectiveFromHint':
        'Bir süredir uyguladığınız bir fiyatı kaydetmek için daha eski bir tarih seçin.',
    'product.price.keptNote':
        'Eski fiyatlar saklanır, böylece bu ürünün eskiden kaça mal olduğuna her zaman bakabilirsiniz.',
    'product.profit.negativeWould':
        'Bu ürün size mal olduğundan {amount} daha ucuza satılacak.',

    // Suppliers list ----------------------------------------------------------
    'supplier.list.title': 'Tedarikçiler',
    'supplier.list.add': 'Ekle',
    'supplier.list.loading': 'Tedarikçiler yükleniyor…',
    'supplier.list.empty': 'Henüz tedarikçi yok',
    'supplier.list.emptyHint':
        'Mal aldığınız firmaları ekleyin, sonra her ürün için birini seçebilirsiniz.',
    'supplier.list.addOne': 'Tedarikçi ekle',
    'supplier.list.added': '{name} eklendi',
    'supplier.list.renamed': 'Adı {name} olarak değiştirildi',
    'supplier.list.removed': '{name} silindi',
    'supplier.list.usedBy': '{what} tarafından kullanılıyor',
    'supplier.list.unused': 'Henüz hiçbir yerde kullanılmıyor',
    'supplier.list.moveFirst': 'Silmeden önce bunları başka bir tedarikçiye taşıyın.',
    'supplier.list.rename': 'Adını değiştir',
    'supplier.list.remove': 'Sil',
    'supplier.list.renameAria': '{name} adını değiştir',
    'supplier.list.removeAria': '{name} tedarikçisini sil',
    'supplier.remove.title': 'Bu tedarikçi silinsin mi?',
    'supplier.remove.aboutTo': 'Silmek üzere olduğunuz tedarikçi',
    'supplier.remove.note':
        'Bu işlem geri alınamaz. Kayıtlarınızda bu tedarikçiye bağlı başka bir şey yok, bu yüzden başka hiçbir şey değişmez.',
    'supplier.remove.removing': 'Siliniyor…',
    'supplier.remove.yes': 'Evet, sil',
    'supplier.remove.keep': 'Vazgeç, kalsın',

    // Error fallbacks, used when the server says nothing more specific ---------
    'error.suppliersListLoad': 'Tedarikçileriniz yüklenemedi.',
    'error.supplierRemove': 'Bu tedarikçi silinemedi.',
    'error.productAdd': 'Ürün eklenemedi. Lütfen tekrar deneyin.',
    'error.productLoad': 'Bu ürün yüklenemedi.',
    'error.productSave': 'Değişiklikleriniz kaydedilemedi.',
    'error.badProductLink': 'Bu ürün bağlantısı geçerli değil.',
    'error.productCreate': 'Ürün oluşturulamadı.',
    'error.stockUpdate': 'Stok güncellenemedi.',
    'error.priceSave': 'Fiyat kaydedilemedi.',
    'error.shopLoad': 'Dükkânınız yüklenemedi.',
    'error.productsLoad': 'Ürünleriniz yüklenemedi.',
    'error.invoicesLoad': 'Faturalarınız yüklenemedi.',
    'error.invoiceLoad': 'Fatura yüklenemedi. Lütfen tekrar deneyin.',
    'error.invoiceApply': 'Fatura uygulanamadı.',
    'error.invoiceReread': 'Fatura yeniden okunamadı.',
    'error.suppliersLoad': 'Tedarikçiler yüklenemedi. Lütfen sayfayı yenileyin.',
    'error.supplierSave': 'Tedarikçi kaydedilemedi.',
    'error.uploadFailed': 'Bu fatura yüklenemedi.',
    'error.barcodeLookup': 'Bu barkod aranamadı.',
    'error.unreachable':
        '{origin} adresindeki sunucuya ulaşılamıyor. Sunucunun çalıştığından ve bu cihazdan erişilebilir olduğundan emin olun.',
};
