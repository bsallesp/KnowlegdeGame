-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "goals" TEXT,
    "knowledgeLevels" TEXT,
    "timePerSession" TEXT,
    "preferredLang" TEXT NOT NULL DEFAULT 'en',
    "rawHistory" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserProfile" ("createdAt", "goals", "id", "knowledgeLevels", "preferredLang", "rawHistory", "timePerSession", "updatedAt", "userId") SELECT "createdAt", "goals", "id", "knowledgeLevels", CASE WHEN "preferredLang" = 'pt' THEN 'en' ELSE "preferredLang" END, "rawHistory", "timePerSession", "updatedAt", "userId" FROM "UserProfile";
DROP TABLE "UserProfile";
ALTER TABLE "new_UserProfile" RENAME TO "UserProfile";
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
