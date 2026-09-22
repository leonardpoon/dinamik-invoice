-- CreateTable
CREATE TABLE `Setting` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `companyName` VARCHAR(191) NOT NULL DEFAULT 'DINAMIK SHIPPING PTE LTD',
    `addressLine` VARCHAR(191) NOT NULL DEFAULT '138 Cecil Street #09-03, Cecil Court, Singapore 069538   Tel: (65) 6222 2811  Fax: (65) 6222 2155',
    `registrationNo` VARCHAR(191) NOT NULL DEFAULT 'Company Registration No. 200403109N',
    `paymentLine1` VARCHAR(191) NOT NULL DEFAULT 'Payment to be made to DINAMIK SHIPPING PTE LTD by Telegraphic Transfer to our account',
    `paymentLine2` VARCHAR(191) NOT NULL DEFAULT 'No. 651-869620-001 with OCBC Bank (Singapore), MBFC Branch, Swift Code: OCBCSGSG',
    `signatoryName` VARCHAR(191) NOT NULL DEFAULT 'Deanna Lim',
    `signatoryTitle` VARCHAR(191) NOT NULL DEFAULT 'General Manager',
    `coverLetterIntro` VARCHAR(191) NOT NULL DEFAULT 'We enclose the following Debit notes and will appreciate your early settlement.',
    `defaultPackingDesc` VARCHAR(191) NOT NULL DEFAULT 'Metal Boxes (MB5)',
    `defaultProductDesc` VARCHAR(191) NOT NULL DEFAULT 'SMR 20 Rubber',
    `defaultBoxesPerContainer` DECIMAL(10, 4) NOT NULL DEFAULT 16,
    `defaultMtPerContainer` DECIMAL(10, 4) NOT NULL DEFAULT 20.16,
    `defaultChargeDesc` VARCHAR(191) NOT NULL DEFAULT 'Transhipment Charge',
    `defaultRatePerMt` DECIMAL(10, 2) NOT NULL DEFAULT 54,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `addressLine1` VARCHAR(191) NOT NULL DEFAULT '',
    `addressLine2` VARCHAR(191) NOT NULL DEFAULT '',
    `addressLine3` VARCHAR(191) NOT NULL DEFAULT '',
    `addressLine4` VARCHAR(191) NOT NULL DEFAULT '',
    `addressLine5` VARCHAR(191) NOT NULL DEFAULT '',
    `attention` VARCHAR(191) NOT NULL DEFAULT '',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Customer_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Buyer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Buyer_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CostRateDefault` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `category` ENUM('PORT', 'TRANSPORT', 'MISC') NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL DEFAULT '',
    `basis` ENUM('PER_CONTAINER', 'PER_BOX', 'PER_MT', 'FLAT') NOT NULL DEFAULT 'PER_CONTAINER',
    `rate` DECIMAL(12, 4) NOT NULL DEFAULT 0,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `CostRateDefault_category_code_key`(`category`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DebitNote` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dnNumber` VARCHAR(191) NOT NULL,
    `yearMonth` VARCHAR(6) NOT NULL,
    `runningNo` INTEGER NOT NULL,
    `dnDate` DATE NOT NULL,
    `customerId` INTEGER NOT NULL,
    `customerInvoiceRef` VARCHAR(191) NOT NULL DEFAULT '',
    `buyerId` INTEGER NULL,
    `contractNo` VARCHAR(191) NOT NULL DEFAULT '',
    `boxes` DECIMAL(12, 2) NOT NULL,
    `packingDesc` VARCHAR(191) NOT NULL,
    `boxesPerContainer` DECIMAL(10, 4) NOT NULL,
    `mtPerContainer` DECIMAL(10, 4) NOT NULL,
    `containers` DECIMAL(12, 4) NOT NULL,
    `tonnage` DECIMAL(12, 3) NOT NULL,
    `productDesc` VARCHAR(191) NOT NULL,
    `feederVessel` VARCHAR(191) NOT NULL DEFAULT '',
    `feederVoyage` VARCHAR(191) NOT NULL DEFAULT '',
    `feederArrivalDate` DATE NULL,
    `blNumber` VARCHAR(191) NOT NULL DEFAULT '',
    `blRef` VARCHAR(191) NOT NULL DEFAULT '',
    `oceanVessel` VARCHAR(191) NOT NULL DEFAULT '',
    `oceanVoyage` VARCHAR(191) NOT NULL DEFAULT '',
    `destination` VARCHAR(191) NOT NULL DEFAULT '',
    `blDate` DATE NULL,
    `chargeDesc` VARCHAR(191) NOT NULL DEFAULT 'Transhipment Charge',
    `ratePerMt` DECIMAL(10, 2) NOT NULL,
    `chargeAmount` DECIMAL(12, 2) NOT NULL,
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `amountInWords` VARCHAR(500) NOT NULL,
    `totalCost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `profit` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `remarks` VARCHAR(1000) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DebitNote_dnNumber_key`(`dnNumber`),
    INDEX `DebitNote_yearMonth_idx`(`yearMonth`),
    INDEX `DebitNote_dnDate_idx`(`dnDate`),
    INDEX `DebitNote_customerId_idx`(`customerId`),
    INDEX `DebitNote_buyerId_idx`(`buyerId`),
    INDEX `DebitNote_destination_idx`(`destination`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DebitNoteCost` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `debitNoteId` INTEGER NOT NULL,
    `category` ENUM('PORT', 'TRANSPORT', 'MISC') NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL DEFAULT '',
    `basis` ENUM('PER_CONTAINER', 'PER_BOX', 'PER_MT', 'FLAT') NOT NULL,
    `rate` DECIMAL(12, 4) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `DebitNoteCost_debitNoteId_idx`(`debitNoteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DebitNote` ADD CONSTRAINT `DebitNote_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DebitNote` ADD CONSTRAINT `DebitNote_buyerId_fkey` FOREIGN KEY (`buyerId`) REFERENCES `Buyer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DebitNoteCost` ADD CONSTRAINT `DebitNoteCost_debitNoteId_fkey` FOREIGN KEY (`debitNoteId`) REFERENCES `DebitNote`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
