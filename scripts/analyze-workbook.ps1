param(
  [Parameter(Mandatory = $true)][string]$InputFile,
  [Parameter(Mandatory = $true)][string]$OutputFile
)

$ErrorActionPreference = 'Stop'
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("saas-xlsx-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  $zipFile = Join-Path $tempRoot 'book.zip'
  Copy-Item -LiteralPath $InputFile -Destination $zipFile
  Expand-Archive -LiteralPath $zipFile -DestinationPath (Join-Path $tempRoot 'book')
  $bookRoot = Join-Path $tempRoot 'book'
  [xml]$workbook = Get-Content -Raw -LiteralPath (Join-Path $bookRoot 'xl\workbook.xml')
  [xml]$relationships = Get-Content -Raw -LiteralPath (Join-Path $bookRoot 'xl\_rels\workbook.xml.rels')
  $shared = @()
  $sharedPath = Join-Path $bookRoot 'xl\sharedStrings.xml'
  if (Test-Path -LiteralPath $sharedPath) {
    [xml]$sharedXml = Get-Content -Raw -LiteralPath $sharedPath
    $shared = @($sharedXml.sst.si | ForEach-Object { [string]$_.InnerText })
  }
  $targets = @{}
  foreach ($rel in $relationships.Relationships.Relationship) { $targets[[string]$rel.Id] = [string]$rel.Target }
  $result = [ordered]@{ file = $InputFile; sheets = @() }
  foreach ($sheet in $workbook.workbook.sheets.sheet) {
    $relId = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $targetValue = $targets[$relId]
    if (-not $targetValue) { throw "Relacionamento ausente para a aba '$($sheet.name)' ($relId)." }
    $target = $targetValue.TrimStart('/')
    if (-not $target.StartsWith('xl/')) { $target = "xl/$target" }
    $sheetPath = Join-Path $bookRoot ($target -replace '/', '\')
    [xml]$xml = Get-Content -Raw -LiteralPath $sheetPath
    $cells = [System.Collections.Generic.List[object]]::new()
    $formulaCount = 0
    $broken = @()
    foreach ($row in @($xml.worksheet.sheetData.row)) {
      foreach ($cell in @($row.c)) {
        $value = $null
        if ($cell.t -eq 'inlineStr') { $value = [string]$cell.is.InnerText }
        elseif ($null -ne $cell.v) {
          $raw = [string]$cell.v
          if ($cell.t -eq 's' -and $raw -match '^\d+$') { $value = $shared[[int]$raw] }
          else { $value = $raw }
        }
        if ($null -ne $cell.f) {
          $formulaCount++
          if ([string]$cell.f -like '*#REF!*' -or $value -eq '#REF!') {
            $broken += [ordered]@{ cell = [string]$cell.r; formula = [string]$cell.f; value = $value }
          }
        }
        if (($null -ne $value -and $value -ne '') -or $null -ne $cell.f) {
          $ref = [string]$cell.r
          $rowNumber = if ($ref -match '\d+$') { [int]$Matches[0] } else { 0 }
          $letters = if ($ref -match '^[A-Z]+') { $Matches[0] } else { '' }
          $columnNumber = 0
          foreach ($char in $letters.ToCharArray()) { $columnNumber = $columnNumber * 26 + ([int]$char - 64) }
          $cells.Add([pscustomobject]@{ row = $rowNumber; col = $columnNumber; ref = $ref; value = $value })
        }
      }
    }
    $rowNumbers = @($cells | Where-Object row -le 10000 | Select-Object -ExpandProperty row -Unique)
    $sampleRows = @()
    foreach ($rowNumber in @($rowNumbers | Sort-Object | Select-Object -First 12)) {
      $rowValues = [ordered]@{}
      foreach ($cell in @($cells | Where-Object row -eq $rowNumber)) { $rowValues[$cell.ref] = $cell.value }
      $sampleRows += [ordered]@{ row = $rowNumber; cells = $rowValues }
    }
    $validations = @($xml.worksheet.dataValidations.dataValidation | ForEach-Object {
      [ordered]@{ sqref = [string]$_.sqref; type = [string]$_.type; formula1 = [string]$_.formula1 }
    })
    $result.sheets += [ordered]@{
      name = [string]$sheet.name
      state = if ($sheet.state) { [string]$sheet.state } else { 'visible' }
      dimension = [string]$xml.worksheet.dimension.ref
      xmlRowCount = @($xml.worksheet.sheetData.row).Count
      nonEmptyCellCount = $cells.Count
      firstDataRow = if ($rowNumbers) { ($rowNumbers | Measure-Object -Minimum).Minimum } else { $null }
      lastDataRow = if ($rowNumbers) { ($rowNumbers | Measure-Object -Maximum).Maximum } else { $null }
      formulas = $formulaCount
      brokenRefs = $broken
      dataValidations = $validations
      conditionalFormattingRanges = @($xml.worksheet.conditionalFormatting | ForEach-Object { [string]$_.sqref })
      filters = @($xml.worksheet.autoFilter | ForEach-Object { [string]$_.ref })
      mergedCells = @($xml.worksheet.mergeCells.mergeCell | ForEach-Object { [string]$_.ref })
      farCells = @($cells | Where-Object { $_.row -gt 10000 -or $_.col -gt 100 } | Select-Object -First 100)
      sampleRows = $sampleRows
    }
  }
  $parent = Split-Path -Parent $OutputFile
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  $result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $OutputFile -Encoding utf8
  Write-Output $OutputFile
}
finally {
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
