/**
 * The interface copy, in English.
 *
 * English is the source language: the code is written in it, so a key's meaning is
 * legible where it is defined. tr.ts is checked against this file's shape, and a
 * key missing from it fails the build.
 *
 * Conventions:
 * - Keys are `area.subject.detail`, lowercase area, camelCase leaves.
 * - Placeholders are {braced}. t() type-checks that callers supply each one.
 * - `<b>` is not used here; a sentence with something rendered inside it keeps a
 *   {hole} and is rendered with <T> - see i18n/index.tsx.
 * - Plural sets end `_one` / `_other` and are read with tPlural(), never a ternary.
 *
 * Sections are grouped by screen so the Turkish pass can run screen by screen.
 */
export const en = {
    // App ---------------------------------------------------------------------
    'app.title': 'UUP — Inventory',

    // Bottom navigation -------------------------------------------------------
    'nav.home': 'Home',
    'nav.products': 'Products',
    'nav.scan': 'Scan',
    'nav.invoices': 'Invoices',
    'nav.settings': 'Settings',

    // Shared controls and blocks ----------------------------------------------
    'common.loading': 'Loading…',
    'common.tryAgain': 'Try again',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.continue': 'Continue',
    'common.save': 'Save',
    'common.back': 'Back',
    'common.optional': 'Optional',
    'common.decreaseByOne': 'Decrease by one',
    'common.increaseByOne': 'Increase by one',

    'common.and': 'and',

    // Dates -------------------------------------------------------------------
    'date.today': 'Today',
    'date.yesterday': 'Yesterday',

    // Price chart -------------------------------------------------------------
    'chart.sellingPrice': 'Selling price',
    'chart.cost': 'Cost',
    'chart.ariaLabel':
        '{series} over time. The full figures are listed below the chart.',
    'chart.caption':
        'A price holds until you change it, so the line steps rather than slopes.',

    // Stock pill --------------------------------------------------------------
    'stock.none': 'None left',
    'stock.left': '{count} left',

    // Counts. Read with tPlural(): English inflects the noun, Turkish does not.
    'count.product_one': '{count} product',
    'count.product_other': '{count} products',
    'count.supplier_one': '{count} supplier',
    'count.supplier_other': '{count} suppliers',
    'count.invoice_one': '{count} invoice',
    'count.invoice_other': '{count} invoices',
    'count.item_one': 'item',
    'count.item_other': 'items',

    // Camera ------------------------------------------------------------------
    'camera.insecure':
        'The camera only works over a secure connection. This page was opened as {origin}, so the browser blocks camera access. Use https, or open the app on this computer at localhost.',
    'camera.unsupported':
        'This browser cannot use the camera. You can still type the barcode instead.',
    'camera.denied':
        'Camera permission was refused. Allow camera access for this site in your browser settings, then try again.',
    'camera.notFound': 'No camera was found on this device.',
    'camera.inUse': 'The camera is already being used by another app. Close it and try again.',
    'camera.constraints': 'This camera does not support the requested video settings.',
    'camera.failed': 'The camera could not be started. You can still type the barcode instead.',

    // Sign in -----------------------------------------------------------------
    'auth.welcome': 'Welcome back',
    'auth.subtitle': 'Sign in to access your account',
    'auth.username': 'Username',
    'auth.password': 'Password',
    'auth.signingIn': 'Signing in…',
    'auth.signIn': 'Sign in',
    'auth.signedIn': 'Signed in',
    'auth.signInFailed': 'Could not sign in.',

    // Settings ----------------------------------------------------------------
    'settings.title': 'Settings',
    'settings.subtitle': 'Your account and app information.',
    'settings.language': 'Language',
    'settings.signedInAs': 'Signed in as',
    'settings.notSignedIn': 'Not signed in',
    'settings.appName': 'UUP inventory',
    'settings.suppliers': 'Suppliers',
    'settings.suppliersHint': 'Add, rename or remove who you buy from',
    'settings.connection': 'Connection',
    'settings.checking': 'Checking…',
    'settings.connected': 'Connected',
    'settings.connectedHint':
        'Your changes are saved and shared with everyone using this shop.',
    'settings.notConnected': 'Not connected',
    'settings.notConnectedHint':
        'The app cannot reach the server, so changes will not save. Check your internet connection and try again.',
    'settings.signOut': 'Sign out',
    'settings.footer': 'Internal tool • Authorised staff only',

    // Home --------------------------------------------------------------------
    'home.title': 'Today',
    'home.checking': 'Checking your shop…',
    'home.nothingNeeds': 'Nothing needs attention.',
    'home.needsAttention_one': '{count} thing needs attention',
    'home.needsAttention_other': '{count} things need attention',
    'home.allClear': 'Everything is stocked, priced and up to date.',
    'home.rowClear': 'All clear',
    'home.scan': 'Scan',
    'home.addProduct': 'Add product',
    'home.recentChanges': 'Recent changes',
    'home.signal.belowCost.label': 'Sold for less than they cost',
    'home.signal.belowCost.detail': 'Every sale of these loses money.',
    'home.signal.low.label': 'Running low',
    'home.signal.low.labelWithZero': 'Running low — {count} of them at zero',
    'home.signal.low.detail': '{threshold} or fewer left.',
    'home.signal.invoices.label': 'Invoices to review',
    'home.signal.invoices.detail':
        'Uploaded, but their stock and costs are not recorded yet.',
    'home.signal.noPrice.label': 'Missing a selling price',
    'home.signal.noPrice.detail':
        'Without one, this app cannot tell you what you earn on them.',
    'home.signal.costRose.label': "Cost changed, price didn't",
    'home.signal.costRose.detail': 'What you pay went up after you set your price.',
    'home.activity.stock': 'Stock {direction}',
    'home.activity.stockDetail': 'Stock {direction} — {detail}',
    'home.activity.price': '{what} set to {amount}',

    // Product list ------------------------------------------------------------
    'product.list.title': 'Products',
    'product.list.add': 'Add',
    'product.list.showingOnly': 'Showing only {filter}',
    'product.list.showAll': 'Show all',
    'product.list.searchPlaceholder': 'Search by name, barcode or brand',
    'product.list.searchLabel': 'Search products',
    'product.list.loading': 'Loading products…',
    'product.list.nothingLeft': 'Nothing left here',
    'product.list.showAllProducts': 'Show all products',
    'product.list.noMatch': 'Nothing matched that search',
    'product.list.noMatchHint': 'Try part of the name, or a different spelling.',
    'product.list.empty': 'No products yet',
    'product.list.emptyHint':
        'Add your first product to start tracking what you have and what it is worth.',
    'product.list.addProduct': 'Add a product',
    'product.sellsFor': 'Sells for',
    'product.costsYou': 'Costs you',

    // Product subsets the home screen links into ------------------------------
    // `inline` is the form that reads inside "Showing only …", written out rather
    // than lowercased at runtime: casing display copy is wrong in Turkish, where
    // "İade".toLowerCase() grows a combining dot.
    'filter.low.title': 'Running low',
    'filter.low.inline': 'products running low',
    'filter.low.empty': 'Nothing is running low.',
    'filter.noPrice.title': 'Missing a selling price',
    'filter.noPrice.inline': 'products missing a selling price',
    'filter.noPrice.empty': 'Every product has a selling price.',
    'filter.costRose.title': "Cost changed, price didn't",
    'filter.costRose.inline': 'products whose cost changed',
    'filter.costRose.empty': 'No costs have moved since you set your prices.',
    'filter.belowCost.title': 'Sold for less than they cost',
    'filter.belowCost.inline': 'products sold below cost',
    'filter.belowCost.empty': 'Nothing is priced below cost.',

    // Scan --------------------------------------------------------------------
    'scan.title': 'Find a product',
    'scan.subtitle': 'Scan its barcode with the camera, or type the number.',
    'scan.looking': 'Looking…',
    'scan.withCamera': 'Scan with camera',
    'scan.manualLabel': 'Or type the barcode',
    'scan.manualHint': 'Works even when the camera does not.',
    'scan.manualPlaceholder': 'For example 8693240002044',
    'scan.find': 'Find product',
    'scan.dialogTitle': 'Scan a product',
    'scan.unknownTitle': 'This barcode is not in your list yet',
    'scan.youScanned': 'You scanned',
    'scan.unknownBody':
        'No product has this barcode. You can add it as a new product, or scan a different one.',
    'scan.addAsNew': 'Add this as a new product',
    'scan.scanAnother': 'Scan another barcode',

    // Barcode scanner panel ---------------------------------------------------
    'scanner.title': 'Scan a barcode',
    'scanner.hint': 'Hold the barcode inside the frame',
    'scanner.close': 'Close the scanner',
    'scanner.opening': 'Opening the camera…',
    'scanner.anyBarcode': 'Any barcode on the product will do',

    // Invoice list ------------------------------------------------------------
    'invoice.list.title': 'Invoices',
    'invoice.list.waiting': '{count} waiting to be reviewed',
    'invoice.list.allReviewed': 'All reviewed',
    'invoice.list.upload': 'Upload',
    'invoice.list.loading': 'Loading invoices…',
    'invoice.list.empty': 'No invoices yet',
    'invoice.list.emptyHint':
        'Photograph a supplier invoice and the app will read the lines off it for you.',
    'invoice.list.uploadOne': 'Upload an invoice',
    'invoice.list.waitingHeading': 'Waiting for you',
    'invoice.list.doneHeading': 'Already recorded',
    'invoice.list.continue': 'Continue',
    'invoice.list.startedAt': 'Started {when}',
    'invoice.list.recorded': 'Recorded',
    'invoice.list.review': 'Review',

    // Invoice upload ----------------------------------------------------------
    'invoice.upload.title': 'Upload an invoice',
    'invoice.upload.subtitle': 'Import stock from supplier invoices.',
    'invoice.upload.step1': 'Who is it from?',
    'invoice.upload.step1Hint': 'The supplier who sent you this invoice.',
    'invoice.upload.supplier': 'Supplier',
    'invoice.upload.loadingSuppliers': 'Loading suppliers…',
    'invoice.upload.selectSupplier': 'Select a supplier…',
    'invoice.upload.step2': 'Photo of the invoice',
    'invoice.upload.step2Hint': 'We read the lines off this photo, so it is worth getting right.',
    'invoice.upload.choosePhoto': 'Take or choose a photo',
    'invoice.upload.changePhoto': 'Use a different photo',
    'invoice.upload.choosePhotoHint': 'Your camera or photo library',
    'invoice.upload.previewAlt': 'The invoice photo you chose',
    'invoice.upload.tipsTitle': 'For the best reading',
    'invoice.upload.tipFlat': 'Lay the invoice flat and hold the camera above it.',
    'invoice.upload.tipWhole': 'Fit the whole page in, edge to edge.',
    'invoice.upload.tipLight': 'Good light, and watch for your own shadow.',
    'invoice.upload.uploading': 'Uploading…',
    'invoice.upload.submit': 'Upload and read it',
    'invoice.upload.whatNext': 'We will read it — about a minute — then you check each line.',
    'invoice.upload.needBoth': 'Choose a supplier and a photo to continue.',
    'invoice.upload.notAnImage': 'Please choose an image file.',
    'invoice.upload.done': 'Invoice uploaded',
    'invoice.upload.noSuppliers': 'Add a supplier first',
    'invoice.upload.noSuppliersHint':
        'An invoice belongs to whoever sent it, so add that supplier before uploading.',
    'invoice.upload.addSupplier': 'Add a supplier',

    // Invoice review ----------------------------------------------------------
    'invoice.review.title': 'Review invoice',
    'invoice.review.reading': 'Reading the invoice…',
    'invoice.review.readingHint': 'This takes a few seconds.',
    'invoice.review.reread': 'Read again',
    'invoice.review.rereadTitle': 'Read this invoice again?',
    'invoice.review.rereadBody':
        'The photo will be read from scratch. Use this if the figures below do not match the paper.',
    'invoice.review.rereadConfirm':
        'The photo will be read from scratch, and the changes you have made on this screen will be replaced.',
    'invoice.review.rereadDone': 'Invoice read again',
    'invoice.review.draftSaving': 'Saving…',
    'invoice.review.draftSaved': 'Changes saved',
    'invoice.review.draftFailed': 'Changes not saved',
    'invoice.review.draftRestored': 'Changes restored',
    'invoice.review.draftRestoredToast': 'Picked up where you left off ({when})',
    'invoice.review.wentWrong': 'Something went wrong',
    'invoice.review.notFound': 'Invoice not found',
    'invoice.review.backToInvoices': 'Back to invoices',
    'invoice.review.supplier': 'Supplier',
    'invoice.review.onDocument': 'On the document: {name}',
    'invoice.review.date': 'Date',
    'invoice.review.unknownDate': 'Unknown',
    'invoice.review.documentLabel': 'Invoice details',
    'invoice.review.linesLabel': 'Invoice lines',
    'invoice.review.noLines': 'Nothing was read from this invoice. Add the lines by hand, or read it again.',
    'invoice.review.noneInFilter': 'No lines here.',
    'invoice.review.addLine': 'Add a line by hand',
    'invoice.review.addLineHint': 'For anything on the paper that was missed.',
    'invoice.review.applying': 'Applying…',
    'invoice.review.apply': 'Apply invoice',
    'invoice.review.applied_one': 'Invoice applied. {count} line updated.',
    'invoice.review.applied_other': 'Invoice applied. {count} lines updated.',
    'invoice.review.willApply_one': '{count} line will be applied',
    'invoice.review.willApply_other': '{count} lines will be applied',
    'invoice.review.blocked_one': '{count} line still needs you',
    'invoice.review.blocked_other': '{count} lines still need you',
    'invoice.review.showThem': 'Show me',

    // Getting through the invoice ---------------------------------------------
    'invoice.review.progressTitle': 'Your progress',
    'invoice.review.progressCount': '{done} of {total} settled',
    'invoice.review.filterLabel': 'Show which lines',
    'invoice.review.filterAll': 'All',
    'invoice.review.filterAttention': 'Needs you',
    'invoice.review.filterReady': 'Ready',
    'invoice.review.filterExcluded': 'Left out',
    'invoice.review.reviewNext': 'Go to the next one',
    'invoice.review.tipsTitle': 'How this works',
    'invoice.review.tipCheck':
        'The figures below were read from your photo, so check them against the paper.',
    'invoice.review.tipProduct':
        'Each line needs a product from your shop, so we know what to update.',
    'invoice.review.tipApply':
        'Nothing changes until you press Apply. Then stock goes up and costs are recorded.',

    // Invoice review, one line -------------------------------------------------
    'invoice.line.newItem': 'New item',
    'invoice.line.includeLabel': 'Include {name} in this invoice',
    'invoice.line.excludedNote': 'Left out - nothing will change',
    'invoice.line.noProductYet': 'No product chosen yet',
    'invoice.line.summaryNumbers': '{quantity} × {price}',
    'invoice.line.effectStockShort': 'stock',
    'invoice.line.effectPriceShort': 'cost',
    'invoice.line.stateReady': 'Ready',
    'invoice.line.stateAttention': 'Needs you',
    'invoice.line.stateExcluded': 'Left out',
    'invoice.line.asPrinted': 'On the paper:',
    'invoice.line.asPrintedNumbers': '{quantity} {unit} · total {total}',
    'invoice.line.code': 'Code: {code}',
    'invoice.line.barcodeTag': 'Barcode: {barcode}',
    'invoice.line.product': 'Which product is this?',
    'invoice.line.productHint': 'The item in your shop whose stock and cost this line updates.',
    'invoice.line.choose': 'Choose a product',
    'invoice.line.change': 'Change',
    'invoice.line.quantity': 'How many came in?',
    'invoice.line.quantityHint': 'Whole units, however the supplier billed them.',
    // Says "excl. VAT" because that is what the prompt now extracts: the Birim
    // Fiyat column, not the VAT-inclusive figure further along the row.
    'invoice.line.unitPrice': 'What did one cost you? (excl. VAT)',
    'invoice.line.unitPriceHint': 'What you pay the supplier, not what you sell it for.',
    'invoice.line.willDo': 'Applying this line will:',
    'invoice.line.updateStock': 'Update the stock level',
    'invoice.line.updatePrice': 'Update what it costs you',
    'invoice.line.effectStockAdd': 'Add {quantity} to what you have on the shelf.',
    'invoice.line.effectStockRemove': 'Take {quantity} off what you have on the shelf.',
    'invoice.line.effectStockUnknown': 'Enter a whole number above, and this will say what changes.',
    'invoice.line.effectPriceSet': 'Record {price} as the new cost of one.',
    'invoice.line.effectPriceUnknown': 'Enter an amount above, and this will say what changes.',
    'invoice.line.remove': 'Remove this line',
    'invoice.line.removeConfirmTitle': 'Remove this line?',
    'invoice.line.removeConfirmBody': 'You added it by hand, so it will simply go.',
    'invoice.line.done': 'Done',
    'invoice.line.mismatch':
        'Quantity × unit price does not match the row total on the invoice ({total}). Check the figures before applying.',

    // Why a line is not ready yet ---------------------------------------------
    'invoice.problem.noProduct': 'Choose the product this line belongs to.',
    'invoice.problem.quantity': 'Enter a whole number that is not zero.',
    'invoice.problem.price': 'Enter what one of these cost you.',
    'invoice.problem.nothingToUpdate':
        'This line is included but would change nothing. Tick one of the two above, or leave the line out.',

    // Choosing a product ------------------------------------------------------
    'picker.title': 'Choose a product',
    'picker.createTitle': 'New product',
    'picker.searchLabel': 'Search your products',
    'picker.searchHint': 'We have filled in what the invoice said - change it if it finds nothing.',
    'picker.searchPlaceholder': 'Product name',
    'picker.searching': 'Searching…',
    'picker.resultsLabel': 'Matching products',
    'picker.resultCount': '{count} products found',
    'picker.noDetails': 'No brand or barcode',
    'picker.noResults': 'Nothing in your shop matches “{query}”.',
    'picker.typeToSearch': 'Type a name, or scan the barcode on the box.',
    'picker.scan': 'Scan a barcode',
    'picker.scanTitle': 'Scan to find a product',
    'picker.barcodeUnknown': 'No product has the barcode {barcode} yet.',
    'picker.createNew': 'Create a new product',
    'picker.createHint':
        'This adds a new item to your shop. Check the details - they came from the photo.',
    'picker.name': 'Product name',
    'picker.namePlaceholder': 'What you call it in the shop',
    'picker.nameRequired': 'A name is needed to create a product.',
    'picker.brand': 'Brand',
    'picker.brandPlaceholder': 'Brand',
    'picker.barcode': 'Barcode',
    'picker.barcodeHint': 'Lets you find this product by scanning it later.',
    'picker.barcodePlaceholder': 'Scan or type the barcode',
    'picker.createConfirm': 'Create this product',
    'picker.backToSearch': 'Back to search',
    'picker.created': '{name} added to your shop',

    // Supplier dialog ---------------------------------------------------------
    'supplier.dialog.newTitle': 'New supplier',
    'supplier.dialog.renameTitle': 'Rename supplier',
    'supplier.dialog.confirmAdd': 'Add this supplier?',
    'supplier.dialog.confirmRename': 'Rename this supplier?',
    'supplier.dialog.currentlyCalled': 'Currently called',
    'supplier.dialog.willBeRenamed': 'Will be renamed to',
    'supplier.dialog.willBeSaved': 'This will be saved as',
    'supplier.dialog.renameNote':
        'Products already pointing at this supplier keep pointing at it.',
    'supplier.dialog.addNote': 'You will be able to choose this supplier for any product.',
    'supplier.dialog.saving': 'Saving…',
    'supplier.dialog.yesRename': 'Yes, rename it',
    'supplier.dialog.yesAdd': 'Yes, add supplier',
    'supplier.dialog.goBack': 'Go back and edit',
    'supplier.dialog.nameLabel': 'Supplier name',
    'supplier.dialog.nameHint': 'The business you buy from.',
    'supplier.dialog.namePlaceholder': 'For example: Yıldız Ambalaj',
    'supplier.dialog.checking': 'Checking your list…',
    'supplier.dialog.taken': '{name} is already in your list.',
    'supplier.dialog.takenNote': 'Capital letters do not make a different supplier.',
    'supplier.dialog.use': 'Use {name}',
    'supplier.dialog.similar_one':
        'You already have a supplier with an almost identical name. Is it the same one?',
    'supplier.dialog.similar_other':
        'You already have suppliers with almost identical names. Is it one of these?',
    'supplier.dialog.noChange': 'No change yet',

    // Product form, shared by Add and Edit -------------------------------------
    'product.form.whatIsIt': 'What is it?',
    'product.form.name': 'Product name',
    'product.form.namePlaceholder': 'For example: 1kg white sugar',
    'product.form.barcode': 'Barcode',
    'product.form.barcodeHint': 'Add it and you can find this product later by scanning it.',
    'product.form.barcodePlaceholder': 'Type or scan the number',
    'product.form.scan': 'Scan',
    'product.form.scanTitle': "Scan the product's barcode",
    'product.form.openInstead': 'Open that product instead',
    'product.form.brand': 'Brand',
    'product.form.supplier': 'Supplier',
    'product.form.supplierHint': 'Who you buy it from.',
    'product.form.notSet': 'Not set',
    'product.form.newSupplier': 'New',
    'product.form.usingSupplier': 'Using {name}',
    'product.form.stockSection': 'How many do you have?',
    'product.form.stockHint':
        'Count what is on the shelf right now. You can correct it any time.',
    'product.form.quantity': 'Quantity in stock',
    'product.form.pricesSection': 'Prices',
    'product.form.pricesHint': 'Leave either one blank if you do not know it yet.',
    'product.form.cost': 'Cost',
    'product.form.costHint': 'What you pay your supplier for one.',
    'product.form.sell': 'Selling price',
    'product.form.sellHint': 'What your customer pays for one.',
    'product.form.priceDate': 'These prices are correct as of',
    'product.form.priceDateHint':
        'Change this if you are entering an older price from a past invoice.',

    // Shared profit copy. Written once, shown on Add, Edit and the detail screen.
    'product.profit.positive':
        'You make {amount} on each one ({margin} of the selling price).',
    'product.profit.negative': 'Careful: this sells for {amount} less than it costs you.',

    // Product form validation --------------------------------------------------
    'product.error.nameRequired': 'Please give the product a name.',
    'product.error.barcodeTaken':
        '{name} already uses this barcode. Clear it, or open that product instead.',
    'product.error.amount': 'Enter an amount, for example {example}.',
    'product.error.wholeNumber': 'Enter a whole number.',
    'product.error.negativeQuantity': 'Quantity cannot be less than zero.',

    // Add product --------------------------------------------------------------
    'product.add.title': 'Add a product',
    'product.add.subtitle':
        'Only the name is needed. Anything you do not know yet can be added later.',
    'product.add.saving': 'Adding…',
    'product.add.submit': 'Add product',
    'product.add.added': '{name} added',

    // Edit product -------------------------------------------------------------
    'product.edit.title': 'Edit product',
    'product.edit.subtitle':
        'Change the details. Prices and stock are changed on the product page, so their history is kept.',
    'product.edit.details': 'Details',
    'product.edit.barcodeSection': 'Barcode',
    'product.edit.barcodeLockedHint':
        'This cannot be changed. It is printed on the product, and changing it here would stop the product being found by scanning.',
    'product.edit.noBarcode': 'No barcode saved',
    'product.edit.loading': 'Loading product…',
    'product.edit.backToProducts': 'Back to products',
    'product.edit.saving': 'Saving…',
    'product.edit.submit': 'Save changes',
    'product.edit.saved': 'Product updated',

    // Product detail -----------------------------------------------------------
    'product.detail.edit': 'Edit',
    'product.detail.notFound': 'Product not found.',
    'product.detail.inStock': 'In stock',
    'product.detail.since': 'since {date}',
    'product.detail.tapToAdd': 'tap to add',
    'product.detail.updateStock': 'Update stock',
    'product.detail.changeCost': 'Change cost',
    'product.detail.changeSell': 'Change selling price',
    'product.detail.changePrices': 'Change prices',
    'product.detail.chartTitle': 'Prices over time',
    'product.detail.chartHint': 'How much this has cost you, and what you have charged.',
    'product.detail.costHistory': 'Cost history',
    'product.detail.costHistoryHint': 'What you paid your supplier, over time.',
    'product.detail.costHistoryEmpty': 'No cost recorded yet.',
    'product.detail.sellHistory': 'Selling price history',
    'product.detail.sellHistoryHint': 'What you charged your customers, over time.',
    'product.detail.sellHistoryEmpty': 'No selling price recorded yet.',
    'product.detail.now': 'Now',
    'product.detail.stockChanges': 'Stock changes',
    'product.detail.stockChangesEmpty': 'Nothing recorded yet.',
    'product.detail.stockNow': 'Stock is now {count}',
    'product.detail.priceSaved_one': 'Price saved',
    'product.detail.priceSaved_other': 'Prices saved',

    // Update stock dialog ------------------------------------------------------
    'product.stock.howMany': 'How many are there now?',
    'product.stock.currently': 'Currently recorded: {count}',
    'product.stock.invalid': 'Enter a whole number of zero or more.',
    'product.stock.thatIs': 'That is {difference} than before.',
    'product.stock.more': '{count} more',
    'product.stock.fewer': '{count} fewer',
    'product.stock.why': 'Why did it change?',
    // Stored on the movement as free text, so what is picked here is what the
    // history will read back. See the note in ProductDetailPage.
    'product.stock.reason.counted': 'Counted the shelf',
    'product.stock.reason.delivery': 'New delivery',
    'product.stock.reason.sold': 'Sold',
    'product.stock.reason.damaged': 'Damaged',
    'product.stock.reason.returned': 'Returned',

    // Change prices dialog -----------------------------------------------------
    'product.price.was': 'Was {previous} — {change}',
    'product.price.up': 'up {amount}',
    'product.price.down': 'down {amount}',
    'product.price.markupHint': 'Or add a markup to the cost:',
    'product.price.markup': '+{percent}',
    'product.price.effectiveFrom': 'Effective from',
    'product.price.effectiveFromHint':
        'Set an earlier date to record a price you have been using for a while.',
    'product.price.keptNote':
        'Earlier prices are kept, so you can always look back at what this used to cost.',
    'product.profit.negativeWould':
        'This would sell for {amount} less than it costs you.',

    // Suppliers list ----------------------------------------------------------
    'supplier.list.title': 'Suppliers',
    'supplier.list.add': 'Add',
    'supplier.list.loading': 'Loading suppliers…',
    'supplier.list.empty': 'No suppliers yet',
    'supplier.list.emptyHint':
        'Add the businesses you buy from, then you can pick one for each product.',
    'supplier.list.addOne': 'Add a supplier',
    'supplier.list.added': '{name} added',
    'supplier.list.renamed': 'Renamed to {name}',
    'supplier.list.removed': '{name} removed',
    'supplier.list.usedBy': 'Used by {what}',
    'supplier.list.unused': 'Not used by anything yet',
    'supplier.list.moveFirst': 'Move those to another supplier before removing it.',
    'supplier.list.rename': 'Rename',
    'supplier.list.remove': 'Remove',
    'supplier.list.renameAria': 'Rename {name}',
    'supplier.list.removeAria': 'Remove {name}',
    'supplier.remove.title': 'Remove this supplier?',
    'supplier.remove.aboutTo': 'You are about to remove',
    'supplier.remove.note':
        'This cannot be undone. Nothing else in your records points at this supplier, so nothing else changes.',
    'supplier.remove.removing': 'Removing…',
    'supplier.remove.yes': 'Yes, remove it',
    'supplier.remove.keep': 'Keep it',

    // Error fallbacks, used when the server says nothing more specific ---------
    'error.suppliersListLoad': 'Could not load your suppliers.',
    'error.supplierRemove': 'Could not remove this supplier.',
    'error.productAdd': 'Could not add the product. Please try again.',
    'error.productLoad': 'Could not load this product.',
    'error.productSave': 'Could not save your changes.',
    'error.badProductLink': 'That product link is not valid.',
    'error.productCreate': 'Could not create the product.',
    'error.stockUpdate': 'Could not update the stock.',
    'error.priceSave': 'Could not save the price.',
    'error.shopLoad': 'Could not load your shop.',
    'error.productsLoad': 'Could not load your products.',
    'error.invoicesLoad': 'Could not load your invoices.',
    'error.invoiceLoad': 'Could not load the invoice. Please try again.',
    'error.invoiceApply': 'Could not apply the invoice.',
    'error.invoiceReread': 'Could not read the invoice again.',
    'error.suppliersLoad': 'Could not load suppliers. Please refresh the page.',
    'error.supplierSave': 'Could not save the supplier.',
    'error.uploadFailed': 'Could not upload that invoice.',
    'error.barcodeLookup': 'Could not look up that barcode.',
    'error.unreachable':
        'Cannot reach the server at {origin}. Check that it is running and reachable from this device.',
} as const;

export type TranslationKey = keyof typeof en;

/**
 * Values are plain strings here, not the literal types of the English copy: a
 * translation may say anything, but it must say something for every key, and it may
 * not invent keys of its own. Both halves of that are what tsc enforces on tr.ts.
 */
export type Dictionary = Record<TranslationKey, string>;
