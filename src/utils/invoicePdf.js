import PDFDocument from 'pdfkit';

/**
 * Converts a number to its Indian Rupee word representation.
 * (Self-contained in case import from frontend folder is tricky, 
 * but since we are in backend api folder, we can just declare it locally)
 */
function getAmountInWords(num) {
  if (num === 0) return 'Rupees Zero Only';
  
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const g = ['', 'Thousand', 'Lakh', 'Crore'];

  function convertGroup(n) {
    let str = '';
    if (n >= 100) {
      str += a[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += b[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) {
      str += a[n] + ' ';
    }
    return str.trim();
  }

  let rupees = Math.floor(num);
  let paise = Math.round((num - rupees) * 100);
  let rupeeStr = '';

  const groups = [];
  groups.push(rupees % 1000); // hundreds
  rupees = Math.floor(rupees / 1000);

  if (rupees > 0) {
    groups.push(rupees % 100); // thousands
    rupees = Math.floor(rupees / 100);
  } else groups.push(0);

  if (rupees > 0) {
    groups.push(rupees % 100); // lakhs
    rupees = Math.floor(rupees / 100);
  } else groups.push(0);

  if (rupees > 0) {
    groups.push(rupees); // crores
  } else groups.push(0);

  const parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const gVal = groups[i];
    if (gVal > 0) {
      const groupName = g[i];
      parts.push(convertGroup(gVal) + (groupName ? ' ' + groupName : ''));
    }
  }

  rupeeStr = parts.join(' ').trim();
  if (!rupeeStr) rupeeStr = 'Zero';

  let finalStr = 'Rupees ' + rupeeStr + ' Only';
  if (paise > 0) {
    const paiseWord = convertGroup(paise);
    finalStr = 'Rupees ' + rupeeStr + ' and ' + paiseWord.trim() + ' Paise Only';
  }
  return finalStr;
}

/**
 * Generates a GST Tax Invoice PDF binary buffer.
 * 
 * @param {Object} order The order document data.
 * @returns {Promise<Buffer>} The PDF file buffer.
 */
export const generatePdfBuffer = (order) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const invoiceNo = order.orderId;
      const invoiceDate = order.createdAt?.toDate 
        ? order.createdAt.toDate().toLocaleDateString('en-IN') 
        : new Date().toLocaleDateString('en-IN');
      const invoiceTime = order.createdAt?.toDate 
        ? order.createdAt.toDate().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) 
        : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

      // Retrieve customer details
      const customerName = order.customerName || '';
      const customerPhone = order.customerPhone || '';
      const businessName = order.businessName || '';
      const customerGST = order.gstNumber || '';
      const customerState = (order.state || 'Andhra Pradesh').trim();

      // Determine if it is Intrastate (within AP) or Interstate
      const isIntrastate = customerState.toLowerCase().replace(/\s+/g, '') === 'andhrapradesh';

      // State Code Mapping
      const stateCodes = {
        'andhrapradesh': '37',
        'telangana': '36',
        'karnataka': '29',
        'tamilnadu': '33',
        'maharashtra': '27',
        'delhi': '07',
        'kerala': '32',
        'gujarat': '24'
      };
      const customerStateNorm = customerState.toLowerCase().replace(/\s+/g, '');
      const customerStateCode = stateCodes[customerStateNorm] || 'N/A';

      // GST Calculation (5% total)
      const totalAmount = order.totalAmount || 0;
      const taxableValue = totalAmount / 1.05;
      const totalGST = totalAmount - taxableValue;

      let cgstAmount = 0;
      let sgstAmount = 0;
      let igstAmount = 0;

      if (isIntrastate) {
        cgstAmount = totalGST / 2;
        sgstAmount = totalGST / 2;
      } else {
        igstAmount = totalGST;
      }

      const sellerGSTIN = '37AEQPK1348P1ZS'; // Official GSTIN

      // 1. Seller Info Header
      doc.fillColor('#0c4a24').fontSize(14).text('RAJU GHEE SWEETS', 40, 40);
      doc.fillColor('#333333').fontSize(8).text(`Store: ${order.storeName || 'Raju Ghee Sweets'}`, 40, 58);
      doc.text('Andhra Pradesh, India', 40, 68);
      doc.fillColor('#0c4a24').text(`GSTIN: ${sellerGSTIN}`, 40, 78);

      // 2. Invoice Meta Header (Right Aligned)
      doc.fillColor('#0c4a24').fontSize(18).text('TAX INVOICE', 320, 40, { align: 'right', width: 235 });
      doc.fillColor('#333333').fontSize(8);
      doc.text(`Invoice No: #${invoiceNo}`, 320, 60, { align: 'right', width: 235 });
      doc.text(`Date: ${invoiceDate}   Time: ${invoiceTime}`, 320, 70, { align: 'right', width: 235 });
      doc.text('Seller State Code: 37 (Andhra Pradesh)', 320, 80, { align: 'right', width: 235 });
      doc.text(`Payment Mode: ${order.paymentMode || 'N/A'}`, 320, 90, { align: 'right', width: 235 });

      // Divider Line
      doc.strokeColor('#ddd').lineWidth(0.5).moveTo(40, 110).lineTo(555, 110).stroke();

      // 3. Bill From / Bill To Tables (Side by Side)
      doc.rect(40, 120, 250, 85).strokeColor('#ddd').stroke();
      doc.rect(305, 120, 250, 85).strokeColor('#ddd').stroke();

      // Header Fill for boxes
      doc.rect(41, 121, 248, 14).fill('#f1f8f3');
      doc.rect(306, 121, 248, 14).fill('#f1f8f3');

      doc.fillColor('#0c4a24').fontSize(8).text('Details of Seller (Bill From)', 45, 124);
      doc.text('Details of Receiver / Buyer (Bill To)', 310, 124);

      doc.fillColor('#333333');
      // Seller content
      doc.text('RAJU GHEE SWEETS', 45, 140, { width: 240 });
      doc.text(`Store Location: ${order.storeName || 'Raju Ghee Sweets'}`, 45, 150, { width: 240 });
      doc.text('Andhra Pradesh, India', 45, 160);
      doc.text(`GSTIN: ${sellerGSTIN}`, 45, 170);
      doc.text('State: Andhra Pradesh (Code: 37)', 45, 180);

      // Buyer Content
      doc.text(businessName || customerName, 310, 140, { width: 240 });
      doc.text(order.address || 'Address Not Provided', 310, 150, { width: 240 });
      doc.text(`GSTIN: ${customerGST || 'N/A'}`, 310, 160);
      doc.text(`State: ${customerState} (Code: ${customerStateCode})`, 310, 170);
      doc.text(`Mobile: +91 ${customerPhone}`, 310, 180);

      // 4. Draw Product Table
      let tableY = 220;
      doc.rect(40, tableY, 515, 18).fill('#0c4a24');

      doc.fillColor('#ffffff').fontSize(8);
      if (isIntrastate) {
        doc.text('S.No', 45, tableY + 5, { width: 25, align: 'center' });
        doc.text('Product Description', 75, tableY + 5, { width: 175 });
        doc.text('HSN', 255, tableY + 5, { width: 30, align: 'center' });
        doc.text('Qty', 290, tableY + 5, { width: 40, align: 'center' });
        doc.text('Rate', 335, tableY + 5, { width: 40, align: 'right' });
        doc.text('Tax Val', 380, tableY + 5, { width: 40, align: 'right' });
        doc.text('CGST', 425, tableY + 5, { width: 40, align: 'right' });
        doc.text('SGST', 470, tableY + 5, { width: 40, align: 'right' });
        doc.text('Total', 515, tableY + 5, { width: 35, align: 'right' });
      } else {
        doc.text('S.No', 45, tableY + 5, { width: 25, align: 'center' });
        doc.text('Product Description', 75, tableY + 5, { width: 200 });
        doc.text('HSN', 280, tableY + 5, { width: 35, align: 'center' });
        doc.text('Qty', 320, tableY + 5, { width: 45, align: 'center' });
        doc.text('Rate', 370, tableY + 5, { width: 45, align: 'right' });
        doc.text('Tax Val', 420, tableY + 5, { width: 45, align: 'right' });
        doc.text('IGST', 470, tableY + 5, { width: 40, align: 'right' });
        doc.text('Total', 515, tableY + 5, { width: 35, align: 'right' });
      }

      doc.fillColor('#333333');
      let currentY = tableY + 18;
      
      order.items.forEach((item, idx) => {
        // Prevent layout spilling (add page if necessary)
        if (currentY > 700) {
          doc.addPage();
          currentY = 40;
        }

        const itemTotal = item.total || 0;
        const itemTaxable = itemTotal / 1.05;
        const itemGST = itemTotal - itemTaxable;
        const itemRate = item.price || 0;

        // Draw line separator
        doc.strokeColor('#eee').lineWidth(0.5).moveTo(40, currentY).lineTo(555, currentY).stroke();

        doc.text(`${idx + 1}`, 45, currentY + 5, { width: 25, align: 'center' });
        doc.text(item.name, 75, currentY + 5, { width: isIntrastate ? 175 : 200 });
        
        if (isIntrastate) {
          const itemCGST = itemGST / 2;
          const itemSGST = itemGST / 2;
          doc.text('2106', 255, currentY + 5, { width: 30, align: 'center' });
          doc.text(item.unit === 'Weight' ? `${item.quantity} kg` : `${item.quantity} pc`, 290, currentY + 5, { width: 40, align: 'center' });
          doc.text(`₹${itemRate.toFixed(2)}`, 335, currentY + 5, { width: 40, align: 'right' });
          doc.text(`₹${itemTaxable.toFixed(2)}`, 380, currentY + 5, { width: 40, align: 'right' });
          doc.text(`₹${itemCGST.toFixed(2)}`, 425, currentY + 5, { width: 40, align: 'right' });
          doc.text(`₹${itemSGST.toFixed(2)}`, 470, currentY + 5, { width: 40, align: 'right' });
          doc.text(`₹${itemTotal.toFixed(2)}`, 515, currentY + 5, { width: 35, align: 'right' });
        } else {
          doc.text('2106', 280, currentY + 5, { width: 35, align: 'center' });
          doc.text(item.unit === 'Weight' ? `${item.quantity} kg` : `${item.quantity} pc`, 320, currentY + 5, { width: 45, align: 'center' });
          doc.text(`₹${itemRate.toFixed(2)}`, 370, currentY + 5, { width: 45, align: 'right' });
          doc.text(`₹${itemTaxable.toFixed(2)}`, 420, currentY + 5, { width: 45, align: 'right' });
          doc.text(`₹${itemGST.toFixed(2)}`, 470, currentY + 5, { width: 40, align: 'right' });
          doc.text(`₹${itemTotal.toFixed(2)}`, 515, currentY + 5, { width: 35, align: 'right' });
        }

        currentY += 18;
      });

      // Bottom stroke of table
      doc.strokeColor('#ddd').lineWidth(0.5).moveTo(40, currentY).lineTo(555, currentY).stroke();

      // Table summary row
      doc.rect(40, currentY, 515, 16).fill('#f9f9f9');
      doc.fillColor('#000000').fontSize(8);
      
      if (isIntrastate) {
        doc.text('Total / Taxable Value:', 75, currentY + 4, { width: 300, align: 'right' });
        doc.text(`₹${taxableValue.toFixed(2)}`, 380, currentY + 4, { width: 40, align: 'right' });
        doc.text(`₹${cgstAmount.toFixed(2)}`, 425, currentY + 4, { width: 40, align: 'right' });
        doc.text(`₹${sgstAmount.toFixed(2)}`, 470, currentY + 4, { width: 40, align: 'right' });
        doc.text(`₹${totalAmount.toFixed(2)}`, 515, currentY + 4, { width: 35, align: 'right' });
      } else {
        doc.text('Total / Taxable Value:', 75, currentY + 4, { width: 340, align: 'right' });
        doc.text(`₹${taxableValue.toFixed(2)}`, 420, currentY + 4, { width: 45, align: 'right' });
        doc.text(`₹${igstAmount.toFixed(2)}`, 470, currentY + 4, { width: 40, align: 'right' });
        doc.text(`₹${totalAmount.toFixed(2)}`, 515, currentY + 4, { width: 35, align: 'right' });
      }

      currentY += 24;

      // 5. Amount in words
      doc.rect(40, currentY, 515, 24).fill('#f9f9f9');
      doc.fillColor('#333333').fontSize(8).text('Amount Chargeable (in words):', 45, currentY + 4);
      doc.fillColor('#0c4a24').fontSize(9).text(getAmountInWords(totalAmount), 45, currentY + 13);

      currentY += 34;

      // 6. GST details + Bank info / Summary Table
      doc.rect(40, currentY, 280, 130).strokeColor('#eee').stroke();
      doc.rect(325, currentY, 230, 130).strokeColor('#eee').stroke();

      // GST and Bank Details box
      doc.fillColor('#333333').fontSize(7.5);
      if (isIntrastate) {
        doc.text(`CGST @ 2.5%: ₹${cgstAmount.toFixed(2)}`, 45, currentY + 8);
        doc.text(`SGST @ 2.5%: ₹${sgstAmount.toFixed(2)}`, 45, currentY + 18);
      } else {
        doc.text(`IGST @ 5.0%: ₹${igstAmount.toFixed(2)}`, 45, currentY + 8);
      }
      doc.text(`Total Tax Amount: ₹${totalGST.toFixed(2)}`, 45, currentY + 28);
      
      // Draw dashed separator inside box
      doc.strokeColor('#eee').lineWidth(0.5).moveTo(45, currentY + 38).lineTo(315, currentY + 38).stroke();
      
      doc.fillColor('#0c4a24').fontSize(8).text('Bank Details for Payment:', 45, currentY + 44);
      doc.fillColor('#333333').fontSize(7.5);
      doc.text('Bank Name: HDFC Bank', 45, currentY + 54);
      doc.text('Account Name: RAJU GHEE SWEETS', 45, currentY + 64);
      doc.text('Account Number: 50200046843751', 45, currentY + 74);
      doc.text('IFSC Code: HDFC0009088', 45, currentY + 84);
      doc.text('Branch: Satyanayanapuram, vijayawada', 45, currentY + 94);

      // Summary table values on the right
      doc.fontSize(8);
      doc.text('Total Taxable Amount:', 330, currentY + 10);
      doc.text(`₹${taxableValue.toFixed(2)}`, 480, currentY + 10, { align: 'right', width: 70 });

      doc.text('Total GST Tax Amount:', 330, currentY + 25);
      doc.text(`₹${totalGST.toFixed(2)}`, 480, currentY + 25, { align: 'right', width: 70 });

      doc.rect(325, currentY + 40, 230, 22).fill('#e2f0d9');
      doc.fillColor('#0c4a24').fontSize(9).text('Grand Total (Incl. GST):', 330, currentY + 47);
      doc.text(`₹${totalAmount.toFixed(2)}`, 480, currentY + 47, { align: 'right', width: 70 });

      doc.fillColor('#333333').fontSize(8);
      doc.text('Advance Paid:', 330, currentY + 72);
      doc.text(`₹${(order.receivedAmount || 0).toFixed(2)}`, 480, currentY + 72, { align: 'right', width: 70 });

      doc.fillColor('#ef4444').fontSize(8);
      doc.text('Balance Due:', 330, currentY + 92);
      doc.text(`₹${Math.max(0, totalAmount - (order.receivedAmount || 0)).toFixed(2)}`, 480, currentY + 92, { align: 'right', width: 70 });

      currentY += 140;

      // 7. Footer Terms / Signatures
      doc.fillColor('#777777').fontSize(7.5);
      doc.text('Terms & Conditions:', 40, currentY + 10);
      doc.text('1. Goods once sold will not be taken back.', 40, currentY + 20);
      doc.text('2. Subject to local jurisdiction.', 40, currentY + 30);
      doc.text('3. This is a computer-generated invoice and requires no physical signature.', 40, currentY + 40);

      doc.fillColor('#333333').fontSize(8);
      doc.text('for Raju Ghee Sweets', 410, currentY + 10, { width: 145, align: 'center' });
      doc.text('Authorized Signatory', 410, currentY + 50, { width: 145, align: 'center' });
      doc.strokeColor('#333').lineWidth(0.5).moveTo(410, currentY + 45).lineTo(555, currentY + 45).stroke();

      doc.end();

    } catch (e) {
      reject(e);
    }
  });
};
