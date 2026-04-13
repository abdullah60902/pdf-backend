const { google } = require('googleapis');

async function checkStorageQuota() {
  const auth = new google.auth.GoogleAuth({
    keyFile: './google-credentials.json',
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });

  // Check storage quota
  const about = await drive.about.get({
    fields: 'storageQuota, user',
  });

  const quota = about.data.storageQuota;
  const user = about.data.user;

  console.log('=== Google Drive Storage Info ===');
  console.log(`User: ${user?.emailAddress}`);
  console.log(`Total Limit:  ${formatBytes(quota?.limit)}`);
  console.log(`Total Usage:  ${formatBytes(quota?.usage)}`);
  console.log(`Drive Usage:  ${formatBytes(quota?.usageInDrive)}`);
  console.log(`Trash Usage:  ${formatBytes(quota?.usageInDriveTrash)}`);
  
  if (quota?.limit && quota?.usage) {
    const percent = ((Number(quota.usage) / Number(quota.limit)) * 100).toFixed(1);
    console.log(`\n📊 Storage ${percent}% used`);
    
    if (Number(quota.usage) >= Number(quota.limit)) {
      console.log('❌ STORAGE IS FULL! This is why uploads are failing.');
      console.log('\nFixing...');
      
      // Try emptying trash first
      try {
        await drive.files.emptyTrash();
        console.log('🧹 Trash emptied!');
      } catch (e) {
        console.log('Could not empty trash:', e.message);
      }

      // List ALL files in the service account drive
      const res = await drive.files.list({
        pageSize: 100,
        fields: 'files(id, name, size, mimeType, createdTime)',
        orderBy: 'createdTime desc',
      });

      if (res.data.files && res.data.files.length > 0) {
        console.log(`\nFound ${res.data.files.length} files to delete:`);
        for (const file of res.data.files) {
          console.log(`  - ${file.name} (${formatBytes(file.size)}) [${file.mimeType}]`);
          try {
            await drive.files.delete({ fileId: file.id });
            console.log(`    ✅ Deleted`);
          } catch (e) {
            console.log(`    ❌ Failed: ${e.message}`);
          }
        }
        // Empty trash again after deleting
        try { await drive.files.emptyTrash(); } catch(e) {}
        console.log('\n✅ All cleanup done! Try conversion again.');
      } else {
        console.log('\n⚠️ Service account has no files.');
        console.log('📌 The storage issue is with your PERSONAL Google account.');
        console.log('👉 Go to: https://one.google.com/storage');
        console.log('👉 Or go to: https://drive.google.com/drive/trash and empty trash');
      }
    }
  }
}

function formatBytes(bytes) {
  if (!bytes) return 'N/A';
  const b = Number(bytes);
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

checkStorageQuota().catch(err => {
  console.error('Error:', err.message);
});
