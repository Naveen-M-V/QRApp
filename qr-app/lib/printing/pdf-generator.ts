import { jsPDF } from "jspdf";
import { PrintSettings, StudentRecord } from "@/types";
import { generateQRDataUrl } from "@/lib/qr/generator";
import { generateBarcodeDataUrl } from "@/lib/barcode/generator";

/**
 * Generates a printable A4 multi-page PDF document containing student QR codes or Barcodes arranged in a clean grid
 */
export async function generatePrintablePdf(
  students: StudentRecord[],
  settings: PrintSettings,
  batchTitle: string = "Student Codes"
): Promise<Blob> {
  const isLandscape = settings.orientation === "landscape";
  const doc = new jsPDF({
    orientation: isLandscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = isLandscape ? 297 : 210;
  const pageHeight = isLandscape ? 210 : 297;

  const cols = settings.columns || 3;
  const rows = settings.rows || 5;
  const margin = settings.marginMm || 12;
  const spacing = settings.spacingMm || 6;

  // Resolve item size in mm based on unit
  let itemSize = settings.qrSizeMm || 42;
  if (settings.sizeUnit === "in" && settings.sizeValue) {
    itemSize = Number((settings.sizeValue * 25.4).toFixed(1));
  } else if (settings.sizeUnit === "cm" && settings.sizeValue) {
    itemSize = Number((settings.sizeValue * 10).toFixed(1));
  } else if (settings.sizeValue) {
    itemSize = settings.sizeValue;
  }

  const isBarcode = settings.codeType === "barcode";
  const itemsPerPage = cols * rows;
  const totalPages = Math.ceil(students.length / itemsPerPage);

  const availableWidth = pageWidth - 2 * margin;
  const cellWidth = (availableWidth - (cols - 1) * spacing) / cols;

  const availableHeight = pageHeight - 2 * margin - 10; // 10mm reserved for header/footer
  const cellHeight = (availableHeight - (rows - 1) * spacing) / rows;

  let currentItem = 0;

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) {
      doc.addPage();
    }

    // Page Header
    doc.setFontSize(8);
    doc.setTextColor(119, 109, 106); // #776D6A
    doc.text(
      `${batchTitle} · Page ${page + 1} of ${totalPages}`,
      margin,
      margin - 4
    );

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (currentItem >= students.length) break;

        const student = students[currentItem];
        const x = margin + c * (cellWidth + spacing);
        const y = margin + r * (cellHeight + spacing);

        // Optional card border
        if (settings.showBorder) {
          doc.setDrawColor(231, 222, 212); // #E7DED4
          doc.setLineWidth(0.3);
          doc.roundedRect(x, y, cellWidth, cellHeight, 1.5, 1.5);
        }

        // Render Barcode or QR Code
        try {
          if (isBarcode) {
            const barcodeDataUrl = await generateBarcodeDataUrl(
              student.registerNo || "000000",
              {
                format: "CODE128",
                displayValue: true,
                fontSize: 12,
              }
            );

            // Barcode dimensions: width approx 85% of cell, proportional height
            const bWidth = Math.min(cellWidth - 4, itemSize * 1.5);
            const bHeight = Math.min(cellHeight - 12, itemSize * 0.55);
            const bX = x + (cellWidth - bWidth) / 2;
            const bY = y + 4;

            doc.addImage(barcodeDataUrl, "PNG", bX, bY, bWidth, bHeight);

            const labelY = bY + bHeight + 4;
            doc.setFontSize(settings.fontSizePt || 8);
            doc.setTextColor(41, 35, 38);

            if (settings.showStudentName) {
              doc.setFont("helvetica", "bold");
              let nameText = student.name || "";
              if (nameText.length > 22) {
                nameText = nameText.substring(0, 20) + "…";
              }
              const nameWidth = doc.getTextWidth(nameText);
              doc.text(nameText, x + (cellWidth - nameWidth) / 2, labelY);
            }
          } else {
            const qrDataUrl = await generateQRDataUrl(student.qrPayload, {
              size: "300",
              ecc: "M",
              quiet: "2",
            });

            // Center QR inside cell
            const qrX = x + (cellWidth - itemSize) / 2;
            const qrY = y + 2;

            doc.addImage(qrDataUrl, "PNG", qrX, qrY, itemSize, itemSize);

            let labelY = qrY + itemSize + 3;

            doc.setFontSize(settings.fontSizePt || 8);
            doc.setTextColor(41, 35, 38); // #292326

            if (settings.showRegisterNo) {
              doc.setFont("helvetica", "bold");
              const regText = student.registerNo || "";
              const regWidth = doc.getTextWidth(regText);
              doc.text(regText, x + (cellWidth - regWidth) / 2, labelY);
              labelY += 3.5;
            }

            if (settings.showStudentName) {
              doc.setFont("helvetica", "normal");
              let nameText = student.name || "";
              if (nameText.length > 22) {
                nameText = nameText.substring(0, 20) + "…";
              }
              const nameWidth = doc.getTextWidth(nameText);
              doc.text(nameText, x + (cellWidth - nameWidth) / 2, labelY);
            }
          }
        } catch (err) {
          console.error("Error rendering student code on PDF", err);
        }

        currentItem++;
      }
    }
  }

  return doc.output("blob");
}
