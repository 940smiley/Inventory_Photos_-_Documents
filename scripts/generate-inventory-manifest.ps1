param(
  [string]$InventoryRoot = "inventory-photographs-and-scans",
  [string]$OutputPath = "docs/inventory-manifest.json"
)

$ErrorActionPreference = "Stop"

$imageExtensions = @(".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic")
$videoExtensions = @(".mp4", ".mov", ".m4v")
$allExtensions = $imageExtensions + $videoExtensions

function Convert-ToWebPath([string]$Path) {
  return ($Path -replace "\\", "/")
}

if (!(Test-Path $InventoryRoot)) {
  throw "Inventory root '$InventoryRoot' was not found."
}

$rootItem = Get-Item -LiteralPath $InventoryRoot
$files = Get-ChildItem -LiteralPath $InventoryRoot -Recurse -File |
  Where-Object {
    $allExtensions -contains $_.Extension.ToLowerInvariant() -and
    $_.Name -ne "desktop.ini"
  } |
  Sort-Object FullName

$items = foreach ($file in $files) {
  $relative = [System.IO.Path]::GetRelativePath((Get-Location).Path, $file.FullName)
  $inventoryRelative = [System.IO.Path]::GetRelativePath($rootItem.FullName, $file.FullName)
  $folder = Split-Path $inventoryRelative -Parent
  $folderWeb = if ($folder) { Convert-ToWebPath $folder } else { "" }
  $parts = if ($folderWeb) { $folderWeb -split "/" } else { @() }

  [pscustomobject]@{
    id = [Convert]::ToHexString([System.Security.Cryptography.SHA1]::HashData([Text.Encoding]::UTF8.GetBytes((Convert-ToWebPath $relative).ToLowerInvariant()))).Substring(0, 12).ToLowerInvariant()
    name = $file.Name
    path = Convert-ToWebPath $relative
    folder = $folderWeb
    folderParts = $parts
    extension = $file.Extension.ToLowerInvariant()
    mediaType = if ($imageExtensions -contains $file.Extension.ToLowerInvariant()) { "image" } else { "video" }
    sizeBytes = $file.Length
    modifiedUtc = $file.LastWriteTimeUtc.ToString("o")
  }
}

$stampItems = $items | Where-Object {
  ($_.path -match "(?i)(stamp|postal|postcard|post-card|cover|philatel|usps|post due|letters-covers)")
}

$manifest = [pscustomobject]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  sourceRoot = Convert-ToWebPath $InventoryRoot
  source = "Inventory_Photos_-_Documents"
  totalItems = @($items).Count
  totalImages = @($items | Where-Object mediaType -eq "image").Count
  totalVideos = @($items | Where-Object mediaType -eq "video").Count
  stampPostalItems = @($stampItems).Count
  items = @($items)
}

$outputDir = Split-Path $OutputPath -Parent
if ($outputDir -and !(Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath -Encoding UTF8

$stampExport = [pscustomobject]@{
  generatedAt = $manifest.generatedAt
  targetRepo = "../stamplicity-V2.0"
  targetImportHint = "Import this JSON into Stamplicity or copy these paths into its scanner/import workflow."
  count = @($stampItems).Count
  items = @($stampItems | ForEach-Object {
    [pscustomobject]@{
      id = $_.id
      title = [IO.Path]::GetFileNameWithoutExtension($_.name)
      imageUri = $_.path
      category = "Stamps & Postal"
      sourceFolder = $_.folder
      dateAdded = $manifest.generatedAt
      processingStatus = "unprocessed"
    }
  })
}

$stampExport | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "docs/stamplicity-share.json" -Encoding UTF8

Write-Host "Wrote $OutputPath with $($manifest.totalItems) media items."
Write-Host "Wrote docs/stamplicity-share.json with $($stampExport.count) stamp/postal items."
