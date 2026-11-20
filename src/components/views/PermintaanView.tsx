import React, { useState, useEffect, useMemo } from 'react';
import {
  FilePlus,
  Send,
  FileText,
  AlertTriangle,
  ArrowRight,
  Search,
  CheckCircle,
  Clock,
  Sparkles,
  Info,
  Package,
  Layers,
  Calculator,
  TrendingUp,
  ShoppingCart,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  CheckSquare,
  Square,
  X,
  Plus,
  Printer,
  Edit2,
  AlertCircle,
  RotateCcw,
  BookOpen,
  Zap,
  Scale,
  Lock
} from 'lucide-react';
import {
  AppState,
  MaterialRequest,
  MaterialSource,
  RequestCartItem,
  WipRecipeItem
} from '../../types';
import { calculateStockBalances } from '../../utils/storage';
import { RequestSlipPdfModal } from '../RequestSlipPdfModal';
import {
  generateSeparateSupplierSlipsPdf,
  groupCartItemsBySupplierAndWip,
  REQUEST_SLIP_ROWS_PER_PAGE,
  RequestSlipDeepLinkData
} from '../../utils/requestSlipPdf';

interface PermintaanViewProps {
  state: AppState;
  onCreateRequest: (req: Omit<MaterialRequest, 'id' | 'requestNumber' | 'date' | 'status'>) => void;
  onCreateMultipleRequests?: (reqs: Array<Omit<MaterialRequest, 'id' | 'requestNumber' | 'date' | 'status'>>) => void;
  onJumpToReceive: (req: MaterialRequest) => void;
  onSwitchTab: (tab: AppState['currentTab']) => void;
  onOpenStockAdjustment?: (materialId?: string) => void;
  deepLinkSlip?: RequestSlipDeepLinkData | null;
  onClearDeepLinkSlip?: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const PermintaanView: React.FC<PermintaanViewProps> = ({
  state,
  onCreateRequest,
  onCreateMultipleRequests,
  onJumpToReceive,
  onSwitchTab,
  onOpenStockAdjustment,
  deepLinkSlip,
  onClearDeepLinkSlip,
  showToast
}) => {
  const [selectedSkuId, setSelectedSkuId] = useState('');
  const [selectedWipId, setSelectedWipId] = useState('');
  const [selectedMatId, setSelectedMatId] = useState('');
  const [batchCount, setBatchCount] = useState<number>(1);
  const [supplier, setSupplier] = useState<MaterialSource>('GDRM');
  const [gdrmBagSize, setGdrmBagSize] = useState<number>(25); // 20, 25, or 50 kg
  const [totalQty, setTotalQty] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [searchHistory, setSearchHistory] = useState('');

  const [selectedRecipeId, setSelectedRecipeId] = useState('');

  // Keranjang Permintaan Material (Request Basket / Crosscheck Cart) State
  const [cartItems, setCartItems] = useState<RequestCartItem[]>(() => {
    try {
      const saved = localStorage.getItem('prodtrack_request_cart_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Crosscheck & Konfirmasi Modal State
  const [isCrosscheckModalOpen, setIsCrosscheckModalOpen] = useState(false);
  const [isCrosscheckVerified, setIsCrosscheckVerified] = useState(false);
  const [isSlipPdfModalOpen, setIsSlipPdfModalOpen] = useState(false);
  const [slipModalGroupKey, setSlipModalGroupKey] = useState<string | undefined>(undefined);
  const [slipModalSupplier, setSlipModalSupplier] = useState<string | undefined>(undefined);
  const [slipModalCustomItems, setSlipModalCustomItems] = useState<RequestCartItem[] | null>(null);
  const [slipModalRequestNumbers, setSlipModalRequestNumbers] = useState<string[] | undefined>(
    undefined
  );
  const [activeQrDetailData, setActiveQrDetailData] = useState<RequestSlipDeepLinkData | null>(
    null
  );
  const [isBatchPrintingPdf, setIsBatchPrintingPdf] = useState(false);

  useEffect(() => {
    if (deepLinkSlip) {
      setActiveQrDetailData(deepLinkSlip);
    }
  }, [deepLinkSlip]);

  // Sync cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('prodtrack_request_cart_v1', JSON.stringify(cartItems));
    } catch {
      // ignore
    }
  }, [cartItems]);

  const stockBalances = calculateStockBalances(state);

  // If no BOM or Master Data
  const hasMasterData = state.master.materials.length > 0 && state.master.wips.length > 0 && state.master.skus.length > 0;

  // Filter available WIPs for selected SKU if linked in skuWips
  const linkedWips = state.master.skuWips
    .filter(sw => sw.skuId === selectedSkuId)
    .map(sw => sw.wipId);

  const availableWips = selectedSkuId && linkedWips.length > 0
    ? state.master.wips.filter(w => linkedWips.includes(w.id))
    : state.master.wips;

  // Filter available materials for selected WIP if linked in wipMats
  const linkedMats = state.master.wipMats
    .filter(wm => wm.wipId === selectedWipId)
    .map(wm => wm.materialId);

  const availableMats = selectedWipId && linkedMats.length > 0
    ? state.master.materials.filter(m => linkedMats.includes(m.id))
    : state.master.materials;

  const selectedSkuObj = state.master.skus.find(s => s.id === selectedSkuId);
  const selectedWipObj = state.master.wips.find(w => w.id === selectedWipId);
  const selectedMatObj = state.master.materials.find(m => m.id === selectedMatId);

  // Recipes for selected WIP
  const recipesForWip = selectedWipId
    ? (state.master.recipes || []).filter(r => r.wipId === selectedWipId)
    : [];

  const activeRecipe = recipesForWip.find(r => r.id === selectedRecipeId) || (recipesForWip.length > 0 ? (recipesForWip.find(r => r.isDefault) || recipesForWip[0]) : null);

  // Auto-select default or first recipe when selectedWipId changes
  useEffect(() => {
    if (!selectedWipId) {
      setSelectedRecipeId('');
      return;
    }
    const rList = (state.master.recipes || []).filter(r => r.wipId === selectedWipId);
    if (rList.length > 0) {
      const def = rList.find(r => r.isDefault) || rList[0];
      setSelectedRecipeId(def.id);
    } else {
      setSelectedRecipeId('');
    }
  }, [selectedWipId, state.master.recipes]);

  // Check if GDRM solid/powder packaging rounding rule applies (15, 20, 25, 50 kg)
  const isGdrmSolid = supplier === 'GDRM' && (selectedMatObj?.type === 'bubuk' || selectedMatObj?.type === 'padat');

  // Priority for unit weight: Recipe Item proportion > Specific WIP-Material BOM rule > Material standard weight
  const recipeItemMatch = activeRecipe?.items?.find(it => it.materialId === selectedMatId);
  const specificBOM = state.master.wipMats.find(
    wm => wm.wipId === selectedWipId && wm.materialId === selectedMatId
  );
  const unitWeight = recipeItemMatch
    ? recipeItemMatch.amountKg
    : (specificBOM ? specificBOM.materialKgPerBatch : (selectedMatObj?.weightKg || 0));
  const theoreticalNeed = unitWeight * (batchCount || 1);

  // Packaging rounding calculation for GDRM solid / powder
  const bagCount = isGdrmSolid ? Math.max(1, Math.ceil(theoreticalNeed / gdrmBagSize)) : 0;
  const roundedOrderQty = isGdrmSolid ? bagCount * gdrmBagSize : theoreticalNeed;
  const surplusQty = isGdrmSolid ? Math.max(0, roundedOrderQty - theoreticalNeed) : 0;

  // Handler: Pilih cepat material dari resep
  const handleSelectMaterialFromRecipe = (item: WipRecipeItem) => {
    setSelectedMatId(item.materialId);
    const m = state.master.materials.find(mat => mat.id === item.materialId);
    if (m?.source) {
      setSupplier(m.source);
    }
    showToast(`Material "${item.materialName || m?.name}" dipilih dari Resep ${activeRecipe?.recipeCode || ''} (${item.amount} ${item.unit}/batch)`);
  };

  // Handler: Tarik Semua Material Resep ke Keranjang Permintaan Sekaligus
  const handlePullAllRecipeMaterials = () => {
    if (!selectedSkuId || !selectedWipId || !activeRecipe) {
      showToast('Pilih SKU, WIP, dan Resep terlebih dahulu', true);
      return;
    }
    if (!activeRecipe.items || activeRecipe.items.length === 0) {
      showToast('Resep ini belum memiliki komponen material', true);
      return;
    }

    const sku = state.master.skus.find(s => s.id === selectedSkuId);
    const wip = state.master.wips.find(w => w.id === selectedWipId);
    if (!sku || !wip) return;

    const currentBatch = batchCount > 0 ? batchCount : 1;
    const newItems: RequestCartItem[] = [];

    for (const it of activeRecipe.items) {
      const mat = state.master.materials.find(m => m.id === it.materialId);
      if (!mat) continue;

      const itSource: MaterialSource = mat.source || 'GDRM';
      const itType = it.materialType || mat.type;
      const itIsGdrmSolid = itSource === 'GDRM' && (itType === 'bubuk' || itType === 'padat');

      let itBagSize = 25;
      const pkgStr = (mat.packaging || '').toLowerCase();
      if (pkgStr.includes('15') || mat.weightKg === 15) itBagSize = 15;
      else if (pkgStr.includes('20') || mat.weightKg === 20) itBagSize = 20;
      else if (pkgStr.includes('50') || mat.weightKg === 50) itBagSize = 50;
      else itBagSize = 25;

      const theoNeed = it.amountKg * currentBatch;
      const itBagCount = itIsGdrmSolid ? Math.max(1, Math.ceil(theoNeed / itBagSize)) : 0;
      const itRoundedQty = itIsGdrmSolid ? itBagCount * itBagSize : theoNeed;
      const itSurplus = itIsGdrmSolid ? Math.max(0, itRoundedQty - theoNeed) : 0;
      const itSaldo = stockBalances[mat.id] ? stockBalances[mat.id].totalActual : 0;

      newItems.push({
        id: `cart_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        skuId: sku.id,
        skuName: sku.name,
        skuCode: sku.code,
        isKite: sku.isKite,
        wipId: wip.id,
        wipName: wip.name,
        materialId: mat.id,
        materialName: mat.name,
        materialCode: mat.code,
        materialType: mat.type,
        qty: itRoundedQty,
        theoreticalQty: itIsGdrmSolid ? theoNeed : itRoundedQty,
        packageSizeKg: itIsGdrmSolid ? itBagSize : undefined,
        packageCount: itIsGdrmSolid ? itBagCount : undefined,
        surplusKg: itIsGdrmSolid ? itSurplus : 0,
        batch: currentBatch,
        saldoAwal: itSaldo,
        supplier: itSource,
        notes: itIsGdrmSolid
          ? `[Tarik Resep ${activeRecipe.recipeCode}] Dibulatkan: ${itBagCount} Zak @ ${itBagSize} kg`
          : `[Tarik Resep ${activeRecipe.recipeCode}] Porsi: ${it.amount} ${it.unit}/batch × ${currentBatch} batch`,
        addedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      });
    }

    if (newItems.length > 0) {
      setCartItems(prev => [...newItems, ...prev]);
      showToast(`⚡ Sukses menarik ${newItems.length} material dari Resep "${activeRecipe.recipeName}" (${activeRecipe.recipeCode}) ke keranjang!`);
    }
  };

  // Auto-detect default GDRM bag size (15, 20, 25, or 50 kg) when material is selected
  useEffect(() => {
    if (selectedMatObj) {
      if (selectedMatObj.source) {
        setSupplier(selectedMatObj.source);
      }
      if (selectedMatObj.type === 'bubuk' || selectedMatObj.type === 'padat') {
        const pkgStr = (selectedMatObj.packaging || '').toLowerCase();
        const weight = selectedMatObj.weightKg;
        if (pkgStr.includes('15') || weight === 15) {
          setGdrmBagSize(15);
        } else if (pkgStr.includes('20') || weight === 20) {
          setGdrmBagSize(20);
        } else if (pkgStr.includes('50') || weight === 50) {
          setGdrmBagSize(50);
        } else {
          setGdrmBagSize(25);
        }
      }
    }
  }, [selectedMatId, selectedMatObj]);

  // Autofill and auto-update totalQty with GDRM rounding rule
  useEffect(() => {
    if (!selectedMatId) return;

    if (isGdrmSolid) {
      // Rule 3: Pembulatan ke atas akan secara otomatis merubah Form order yang dikirim
      setTotalQty(roundedOrderQty.toFixed(4));
    } else {
      setTotalQty(theoreticalNeed.toFixed(4));
    }
  }, [selectedMatId, batchCount, selectedWipId, supplier, gdrmBagSize, isGdrmSolid, roundedOrderQty, theoreticalNeed]);

  // Current Saldo Awal from stock balance
  const currentSaldoAwal = selectedMatId && stockBalances[selectedMatId]
    ? stockBalances[selectedMatId].totalActual
    : 0;

  // 1. Masukkan ke Keranjang Permintaan (Draft Crosscheck)
  const handleAddToCart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSkuId || !selectedWipId || !selectedMatId) {
      showToast('Harap lengkapi semua pilihan formulir (SKU, WIP, dan Material)', true);
      return;
    }

    const qtyNumber = parseFloat(totalQty);
    if (isNaN(qtyNumber) || qtyNumber <= 0) {
      showToast('Kuantitas tidak valid', true);
      return;
    }

    const mat = state.master.materials.find(m => m.id === selectedMatId);
    const sku = state.master.skus.find(s => s.id === selectedSkuId);
    const wip = state.master.wips.find(w => w.id === selectedWipId);

    if (!mat || !sku || !wip) {
      showToast('Data master tidak valid', true);
      return;
    }

    const newItem: RequestCartItem = {
      id: `cart_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      skuId: sku.id,
      skuName: sku.name,
      skuCode: sku.code,
      isKite: sku.isKite,
      wipId: wip.id,
      wipName: wip.name,
      materialId: mat.id,
      materialName: mat.name,
      materialCode: mat.code,
      materialType: mat.type,
      qty: qtyNumber, // Qty form order resmi yang dikirim (dibulatkan)
      theoreticalQty: isGdrmSolid ? theoreticalNeed : qtyNumber,
      packageSizeKg: isGdrmSolid ? gdrmBagSize : undefined,
      packageCount: isGdrmSolid ? bagCount : undefined,
      surplusKg: isGdrmSolid ? surplusQty : 0,
      batch: batchCount,
      saldoAwal: currentSaldoAwal,
      supplier,
      shift: 1, // SOP Rule: Permintaan material hanya dapat dilakukan di Shift 1
      notes: isGdrmSolid
        ? (notes ? `${notes} (Dibulatkan: ${bagCount} Zak @ ${gdrmBagSize} kg)` : `Pembulatan GDRM: ${bagCount} Zak @ ${gdrmBagSize} kg`)
        : notes,
      addedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };

    setCartItems(prev => [newItem, ...prev]);
    // Reset material field so operator can quickly add other materials
    setSelectedMatId('');
    setNotes('');
    showToast(
      isGdrmSolid
        ? `"${mat.name}" (+${qtyNumber.toFixed(2)} kg / ${bagCount} Zak) dimasukkan ke keranjang`
        : `"${mat.name}" (+${qtyNumber.toFixed(2)} kg) dimasukkan ke keranjang`
    );
  };

  // Hapus 1 item dari keranjang
  const handleRemoveFromCart = (itemId: string) => {
    setCartItems(prev => prev.filter(item => item.id !== itemId));
    showToast('Item berhasil dihapus dari keranjang');
  };

  // Kosongkan seluruh keranjang
  const handleClearCart = () => {
    if (cartItems.length === 0) return;
    setCartItems([]);
    showToast('Keranjang permintaan telah dikosongkan');
  };

  // Kirim langsung single item tanpa antrean keranjang (opsi cepat darurat)
  const handleDirectSend = () => {
    if (!selectedSkuId || !selectedWipId || !selectedMatId) {
      showToast('Harap lengkapi semua pilihan formulir untuk kirim langsung', true);
      return;
    }

    const qtyNumber = parseFloat(totalQty);
    if (isNaN(qtyNumber) || qtyNumber <= 0) {
      showToast('Kuantitas tidak valid', true);
      return;
    }

    onCreateRequest({
      skuId: selectedSkuId,
      wipId: selectedWipId,
      materialId: selectedMatId,
      qty: qtyNumber,
      theoreticalQty: isGdrmSolid ? theoreticalNeed : qtyNumber,
      packageSizeKg: isGdrmSolid ? gdrmBagSize : undefined,
      packageCount: isGdrmSolid ? bagCount : undefined,
      surplusKg: isGdrmSolid ? surplusQty : 0,
      batch: batchCount,
      saldoAwal: currentSaldoAwal,
      supplier,
      shift: 1, // SOP Rule: Permintaan material hanya dapat dilakukan di Shift 1
      notes: isGdrmSolid
        ? (notes ? `${notes} (Dibulatkan: ${bagCount} Zak @ ${gdrmBagSize} kg)` : `Pembulatan GDRM: ${bagCount} Zak @ ${gdrmBagSize} kg`)
        : notes
    });

    setSelectedMatId('');
    setNotes('');
    showToast(
      isGdrmSolid
        ? `Permintaan langsung Shift 1 dikirim ke GDRM: ${qtyNumber.toFixed(4)} kg (${bagCount} Zak @ ${gdrmBagSize} kg)`
        : `Permintaan material Shift 1 berhasil dikirim ke ${supplier}`
    );
  };

  // Buka Modal Crosscheck & Konfirmasi
  const handleOpenCrosscheckModal = () => {
    if (cartItems.length === 0) {
      showToast('Keranjang permintaan masih kosong! Tambahkan material terlebih dahulu', true);
      return;
    }
    setIsCrosscheckVerified(false);
    setIsCrosscheckModalOpen(true);
  };

  // Eksekusi Kirim Semua Permintaan dari Keranjang
  const handleConfirmAndSendAll = () => {
    if (cartItems.length === 0) return;

    const requestPayloads = cartItems.map(item => ({
      skuId: item.skuId,
      wipId: item.wipId,
      materialId: item.materialId,
      qty: item.qty,
      theoreticalQty: item.theoreticalQty,
      packageSizeKg: item.packageSizeKg,
      packageCount: item.packageCount,
      surplusKg: item.surplusKg,
      batch: item.batch,
      saldoAwal: item.saldoAwal,
      supplier: item.supplier,
      shift: (1 as const), // SOP Rule: Permintaan material hanya dapat dilakukan di Shift 1
      notes: item.notes
    }));

    if (onCreateMultipleRequests) {
      onCreateMultipleRequests(requestPayloads);
    } else {
      requestPayloads.forEach(payload => {
        onCreateRequest(payload);
      });
    }

    const sentCount = cartItems.length;
    setCartItems([]);
    setIsCrosscheckModalOpen(false);
    showToast(`Berhasil mengirim ${sentCount} permintaan material resmi ke supplier (GDRM / Formulasi)!`);
  };

  // Kelompokkan item keranjang berdasarkan Supplier & Jenis WIP untuk pencetakan slip PDF terpisah
  const cartItemsBySlipGroup = useMemo(
    () => groupCartItemsBySupplierAndWip(cartItems),
    [cartItems]
  );

  // Helper konversi MaterialRequest (History) ke RequestCartItem untuk cetak slip per supplier & WIP
  const mapHistoryReqToCartItem = (req: MaterialRequest): RequestCartItem => {
    const sku = state.master.skus.find(s => s.id === req.skuId);
    const wip = state.master.wips.find(w => w.id === req.wipId);
    const mat = state.master.materials.find(m => m.id === req.materialId);
    return {
      id: req.id,
      skuId: req.skuId,
      skuName: sku?.name || 'SKU',
      skuCode: sku?.code,
      isKite: sku?.isKite,
      wipId: req.wipId,
      wipName: wip?.name || 'WIP',
      materialId: req.materialId,
      materialName: mat?.name || 'Material',
      materialCode: mat?.code,
      materialType: mat?.type || 'bubuk',
      qty: req.qty,
      theoreticalQty: req.theoreticalQty ?? req.qty,
      packageSizeKg: req.packageSizeKg,
      packageCount: req.packageCount,
      surplusKg: req.surplusKg,
      batch: req.batch,
      saldoAwal: req.saldoAwal,
      supplier: req.supplier,
      shift: req.shift || 1,
      notes: req.notes,
      addedAt: req.date
    };
  };

  // Buka pratinjau/cetak slip untuk 1 grup (Supplier + WIP) tertentu
  const handlePrintCart = (targetGroupKey?: string) => {
    if (cartItems.length === 0) {
      showToast('Keranjang permintaan masih kosong! Tambahkan material terlebih dahulu', true);
      return;
    }
    const targetGrp =
      cartItemsBySlipGroup.find(g => g.key === targetGroupKey) || cartItemsBySlipGroup[0];
    setSlipModalCustomItems(null);
    setSlipModalRequestNumbers(undefined);
    setSlipModalGroupKey(targetGrp?.key);
    setSlipModalSupplier(targetGrp?.supplier);
    setIsSlipPdfModalOpen(true);
  };

  // Langsung generate & unduh file PDF terpisah untuk setiap (Supplier + WIP) pada keranjang
  const handlePrintAllSlipsBySupplier = async () => {
    if (cartItems.length === 0) {
      showToast('Keranjang permintaan masih kosong! Tambahkan material terlebih dahulu', true);
      return;
    }
    setIsBatchPrintingPdf(true);
    try {
      const groups = await generateSeparateSupplierSlipsPdf(cartItems, state);
      const summary = groups
        .map(
          g =>
            `${g.supplier} • ${g.wipName} (${g.items.length} item${
              g.pageCount > 1 ? `, ${g.pageCount} lbr` : ''
            })`
        )
        .join(', ');
      showToast(
        `Berhasil mencetak ${groups.length} file Slip PDF terpisah per Supplier & WIP: ${summary}.`
      );
    } catch (err) {
      console.error('Failed generating supplier-wip-split PDFs:', err);
      showToast('Gagal mencetak slip PDF terpisah per Supplier & WIP.', true);
    } finally {
      setIsBatchPrintingPdf(false);
    }
  };

  // Cetak ulang Slip PDF dari 1 baris History Permintaan Material (dengan Request Number di QR)
  const handlePrintHistoryRequest = (req: MaterialRequest) => {
    const mapped = mapHistoryReqToCartItem(req);
    const wipKey = mapped.wipId || mapped.wipName || 'UMUM';
    setSlipModalCustomItems([mapped]);
    setSlipModalRequestNumbers([req.requestNumber]);
    setSlipModalGroupKey(`${req.supplier || 'GDRM'}__${wipKey}`);
    setSlipModalSupplier(req.supplier);
    setIsSlipPdfModalOpen(true);
  };

  // Cetak semua permintaan Pending (dari History) menjadi slip PDF terpisah per Supplier & WIP
  const handlePrintPendingHistoryBySupplier = async (pendingReqs: MaterialRequest[]) => {
    if (pendingReqs.length === 0) {
      showToast('Tidak ada permintaan berstatus Menunggu untuk dicetak.', true);
      return;
    }
    setIsBatchPrintingPdf(true);
    try {
      const groupsReqMap = new Map<string, MaterialRequest[]>();
      const mappedItems = pendingReqs.map(req => {
        const mapped = mapHistoryReqToCartItem(req);
        const sup = mapped.supplier || 'GDRM';
        const wipKey = mapped.wipId || mapped.wipName || 'UMUM';
        const compositeKey = `${sup}__${wipKey}`;
        const arr = groupsReqMap.get(compositeKey) || [];
        arr.push(req);
        groupsReqMap.set(compositeKey, arr);
        return mapped;
      });

      const groupedCarts = groupCartItemsBySupplierAndWip(mappedItems);
      const { buildSupplierSlipFormOptions, generateMaterialRequestSlipPdf } = await import(
        '../../utils/requestSlipPdf'
      );

      for (let i = 0; i < groupedCarts.length; i++) {
        if (i > 0) {
          await new Promise<void>(resolve => setTimeout(resolve, 180));
        }
        const g = groupedCarts[i];
        const reqNumbers = (groupsReqMap.get(g.key) || []).map(r => r.requestNumber);
        const opts = buildSupplierSlipFormOptions(g.supplier, g.items, state, {
          wipId: g.wipId,
          wipName: g.wipName,
          requestNumbers: reqNumbers
        });
        await generateMaterialRequestSlipPdf(g.items, opts);
      }
      showToast(
        `Berhasil mencetak ${groupedCarts.length} Slip PDF terpisah berdasarkan Supplier & WIP (${groupedCarts
          .map(g => `${g.supplier}•${g.wipName}`)
          .join(', ')}).`
      );
    } catch (err) {
      console.error('Failed printing pending history slips:', err);
      showToast('Gagal mencetak slip PDF pending per Supplier & WIP.', true);
    } finally {
      setIsBatchPrintingPdf(false);
    }
  };

  // Cart summary calculations
  const totalCartQty = cartItems.reduce((acc, curr) => acc + curr.qty, 0);
  const totalCartTheoretical = cartItems.reduce((acc, curr) => acc + curr.theoreticalQty, 0);
  const totalCartSurplus = cartItems.reduce((acc, curr) => acc + (curr.surplusKg || 0), 0);
  const gdrmCartItems = cartItems.filter(item => item.supplier === 'GDRM');
  const formulasiCartItems = cartItems.filter(item => item.supplier === 'Formulasi');
  const totalGdrmBags = gdrmCartItems.reduce((acc, curr) => acc + (curr.packageCount || 0), 0);

  if (!hasMasterData) {
    return (
      <div className="max-w-md mx-auto text-center py-12 px-4 bg-slate-900 border border-slate-800 rounded-2xl mt-6 shadow-xl">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-base text-white mb-1">Master Data / BOM Belum Terisi</h3>
        <p className="text-xs text-slate-400 mb-5 leading-relaxed">
          Sebelum permintaan material dapat diajukan, komponen penyusun WIP, SKU, dan hierarki BOM perlu dikonfigurasi oleh administrator.
        </p>
        <button
          onClick={() => onSwitchTab('master')}
          className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-600/20 transition active:scale-95"
        >
          Konfigurasi Master Data & BOM
        </button>
      </div>
    );
  }

  const filteredRequests = state.transactions.requests.filter(req => {
    const sObj = state.master.skus.find(s => s.id === req.skuId);
    const mObj = state.master.materials.find(m => m.id === req.materialId);
    const query = searchHistory.toLowerCase();
    return (
      req.requestNumber.toLowerCase().includes(query) ||
      (sObj && sObj.name.toLowerCase().includes(query)) ||
      (mObj && mObj.name.toLowerCase().includes(query)) ||
      req.supplier.toLowerCase().includes(query)
    );
  });

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* SOP Rule Banner: Permintaan Hanya di Shift 1 */}
      <div className="bg-sky-500/10 border border-sky-500/30 p-3.5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
        <div className="flex items-start sm:items-center space-x-3">
          <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <span className="text-xs sm:text-sm font-bold text-sky-300">
                Aturan SOP: Permintaan Material HANYA Dapat Dilakukan di Shift 1
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 font-mono">
                Shift 1 (07:01 - 15:00)
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              Sesuai SOP produksi pabrik, seluruh formulir order permintaan material ke gudang/supplier (GDRM / Formulasi) hanya diterbitkan pada Shift 1. Pengiriman & kedatangan material dilayani pada Shift 1 dan Shift 2.
            </p>
          </div>
        </div>

        {state.currentUserRole === 'ADMINISTRATOR' && onOpenStockAdjustment && (
          <button
            type="button"
            onClick={() => onOpenStockAdjustment(selectedMatId || undefined)}
            className="shrink-0 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95 shadow-xs"
            title="Buka Penyesuaian Saldo Awal Material (Akses Administrator)"
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Adjust Saldo Awal (Admin)</span>
          </button>
        )}
      </div>

      {/* Request Form */}
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-3">
          <h3 className="font-bold text-sm text-white flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <FilePlus className="w-4 h-4" />
            </div>
            <span>Form Permintaan Material ke Supplier (GDRM / Formulasi)</span>
          </h3>
          <div className="flex items-center space-x-2 text-[11px] font-mono">
            <span className="text-slate-400">
              Saldo Aktual: <strong className="text-cyan-400">{currentSaldoAwal.toFixed(4)} kg</strong>
            </span>
            {state.currentUserRole === 'ADMINISTRATOR' && onOpenStockAdjustment && selectedMatId && (
              <button
                type="button"
                onClick={() => onOpenStockAdjustment(selectedMatId)}
                className="text-[10px] text-amber-400 hover:text-amber-300 underline font-sans font-semibold"
                title="Sesuaikan Saldo Awal Material Ini"
              >
                (Adjust Saldo Awal)
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleAddToCart} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* Shift Indicator (Locked to Shift 1 per Factory SOP) */}
          <div className="sm:col-span-2 bg-slate-950/60 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Lock className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[11px] text-slate-300">
                Shift Operasional Permintaan: <strong className="text-sky-300 font-bold">Shift 1 (Pagi • 07:01 - 15:00)</strong>
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30 font-semibold">
              Terkunci Sesuai Aturan SOP
            </span>
          </div>

          {/* SKU Selection */}
          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Pilih SKU Produk
            </label>
            <select
              value={selectedSkuId}
              onChange={(e) => {
                setSelectedSkuId(e.target.value);
                setSelectedWipId('');
                setSelectedMatId('');
              }}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">-- Pilih SKU Produk --</option>
              {state.master.skus.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.isKite ? '⭐ (KITE Ekspor)' : '(Domestik)'} - {s.cartonWeightKg.toFixed(4)} kg/ktn
                </option>
              ))}
            </select>
            {selectedSkuObj && (
              <span className="text-[10px] text-slate-400 mt-1 block">
                Target: {selectedSkuObj.targetHour} ktn/jam | Status: {selectedSkuObj.isKite ? 'Fasilitas KITE Ekspor' : 'Pasar Domestik'}
              </span>
            )}
          </div>

          {/* WIP Selection */}
          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Pilih Jenis WIP
            </label>
            <select
              value={selectedWipId}
              onChange={(e) => {
                setSelectedWipId(e.target.value);
                setSelectedMatId('');
              }}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="">-- Pilih WIP --</option>
              {availableWips.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name} (1 Batch = {w.batchWeightKg.toFixed(4)} kg)
                </option>
              ))}
            </select>
            {selectedWipObj && (
              <span className="text-[10px] text-amber-400/90 mt-1 block">
                Bobot Batch Acuan: {selectedWipObj.batchWeightKg.toFixed(4)} kg
              </span>
            )}
          </div>

          {/* OPSI PILIH MATERIAL DARI RESEP FORMULASI WIP */}
          {selectedWipId && (
            <div className="sm:col-span-2 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-cyan-500/30 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-800 pb-2.5">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="font-bold text-xs sm:text-sm text-white">Resep Formulasi Acuan WIP</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-medium">
                        Pilihan Cepat Sesuai Resep SKU
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Pilih bahan baku langsung dari resep formulasi untuk mempercepat pembuatan order permintaan
                    </p>
                  </div>
                </div>

                {recipesForWip.length > 0 ? (
                  <div className="flex items-center space-x-2 self-start sm:self-auto">
                    <select
                      value={activeRecipe?.id || ''}
                      onChange={(e) => {
                        setSelectedRecipeId(e.target.value);
                        setSelectedMatId('');
                      }}
                      className="bg-slate-800 border border-cyan-500/40 rounded-xl px-3 py-1.5 text-xs text-cyan-300 focus:outline-none focus:border-cyan-400 font-bold"
                    >
                      {recipesForWip.map(r => (
                        <option key={r.id} value={r.id}>
                          [{r.recipeCode}] {r.recipeName} ({r.totalWeightKg.toFixed(4)} kg) {r.isDefault ? '★ Resep Utama' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="text-[11px] text-amber-400 font-medium bg-amber-500/10 px-2.5 py-1 rounded-xl border border-amber-500/20">
                    Belum ada resep di Master BOM
                  </span>
                )}
              </div>

              {activeRecipe ? (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 text-xs">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <span className="font-mono text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded text-xs border border-amber-500/20">
                        {activeRecipe.recipeCode}
                      </span>
                      <span className="font-bold text-white text-xs">{activeRecipe.recipeName}</span>
                      {activeRecipe.isDefault && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-medium">
                          Resep Default
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 font-mono">
                        • {activeRecipe.items?.length || 0} Material • Total Resep: {activeRecipe.totalWeightKg.toFixed(4)} kg/batch
                      </span>
                    </div>

                    {/* 1-Click Pull All Recipe Materials to Cart */}
                    {activeRecipe.items && activeRecipe.items.length > 0 && (
                      <button
                        type="button"
                        onClick={handlePullAllRecipeMaterials}
                        title={`Tarik sekaligus semua (${activeRecipe.items.length}) bahan resep untuk ${batchCount} batch ke keranjang`}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-cyan-500 via-cyan-600 to-amber-500 hover:from-cyan-400 hover:to-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-md shadow-cyan-500/20 transition active:scale-95 shrink-0"
                      >
                        <Zap className="w-3.5 h-3.5 fill-slate-950" />
                        <span>⚡ Tarik Semua ({activeRecipe.items.length}) Bahan Resep ke Keranjang</span>
                      </button>
                    )}
                  </div>

                  {/* Clickable Recipe Material Pills for instant selection */}
                  {activeRecipe.items && activeRecipe.items.length > 0 ? (
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block mb-1.5">
                        Klik Cepat Material Resep untuk Mengisi Formulir Order ({batchCount} batch):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {activeRecipe.items.map((it) => {
                          const isSelected = selectedMatId === it.materialId;
                          const matObj = state.master.materials.find(m => m.id === it.materialId);
                          const totalNeededKg = it.amountKg * (batchCount || 1);
                          return (
                            <button
                              key={it.id}
                              type="button"
                              onClick={() => handleSelectMaterialFromRecipe(it)}
                              className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs transition border font-medium active:scale-95 ${
                                isSelected
                                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/50 shadow-md shadow-cyan-500/20'
                                  : 'bg-slate-900 border-slate-700/80 text-slate-200 hover:border-cyan-500/50 hover:bg-slate-800 hover:text-white'
                              }`}
                            >
                              <span className="font-semibold">{it.materialName || matObj?.name}</span>
                              <span className="font-mono text-[10px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                {it.amount} {it.unit}/batch
                              </span>
                              <span className="font-mono text-[10px] text-cyan-400">
                                ({totalNeededKg.toFixed(2)} kg)
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">
                      Resep formulasi ini belum memiliki daftar material di Master BOM. Silakan tambahkan material di tab Master BOM.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">
                  Untuk menggunakan fitur pemilihan cepat formulasi, buat resep di tab <strong className="text-cyan-400">Master BOM &gt; 1. Hierarki BOM &gt; Resep Formulasi</strong>.
                </p>
              )}
            </div>
          )}

          {/* Material Selection (Autosaved Database) */}
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-medium text-slate-300">
                Pilih Material Dibutuhkan (Database Acuan Terhubung)
              </label>
              {recipeItemMatch && (
                <span className="text-[10px] text-cyan-400 font-mono font-semibold">
                  ✓ Sesuai Resep: {recipeItemMatch.amount} {recipeItemMatch.unit}/batch ({recipeItemMatch.amountKg.toFixed(4)} kg)
                </span>
              )}
            </div>
            <select
              value={selectedMatId}
              onChange={(e) => setSelectedMatId(e.target.value)}
              required
              className={`w-full bg-slate-800 border rounded-xl px-3 py-2 text-white focus:outline-none font-medium ${
                recipeItemMatch ? 'border-cyan-500/70' : 'border-slate-700 focus:border-cyan-500'
              }`}
            >
              <option value="">-- Pilih Material dari Database --</option>
              {activeRecipe && activeRecipe.items && activeRecipe.items.length > 0 && (
                <optgroup label={`⭐ Bahan Resep: [${activeRecipe.recipeCode}] ${activeRecipe.recipeName}`}>
                  {activeRecipe.items.map(it => {
                    const m = state.master.materials.find(mat => mat.id === it.materialId);
                    if (!m) return null;
                    return (
                      <option key={`recipe_${it.id}`} value={m.id}>
                        ⭐ {m.code ? `[${m.code}] ` : ''}{m.name} | Resep: {it.amount} {it.unit}/batch ({it.amountKg.toFixed(4)} kg) | {m.source}
                      </option>
                    );
                  })}
                </optgroup>
              )}
              <optgroup label="Daftar Material Database Lengkap">
                {availableMats.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.code ? `[${m.code}] ` : ''}{m.name} | {m.source} - {m.type.toUpperCase()} | Kemasan: {m.packaging} ({m.weightKg.toFixed(4)} kg)
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Batch Count & Supplier */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                Jumlah Batch WIP
              </label>
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={batchCount}
                onChange={(e) => setBatchCount(parseFloat(e.target.value) || 0)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                Supplier Tujuan
              </label>
              <select
                value={supplier}
                onChange={(e) => setSupplier(e.target.value as MaterialSource)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                <option value="GDRM">GDRM (Gudang Bahan Baku)</option>
                <option value="Formulasi">Formulasi (Premix / Custom)</option>
              </select>
            </div>
          </div>

          {/* ATURAN PENGIRIMAN SUPPLIER GDRM: PEMBULATAN KEMASAN PABRIKASI (20 kg / 25 kg / 50 kg) */}
          {isGdrmSolid && (
            <div className="sm:col-span-2 bg-gradient-to-r from-amber-950/50 via-slate-900 to-amber-950/30 border border-amber-500/40 p-3.5 sm:p-4 rounded-xl space-y-3 shadow-inner">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-amber-500/30 pb-2">
                <div className="flex items-center space-x-2">
                  <div className="p-1 rounded-lg bg-amber-500/20 text-amber-400">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs sm:text-sm text-white flex items-center space-x-2">
                      <span>Aturan Pengiriman GDRM: Kemasan Pabrikasi ({selectedMatObj?.type === 'padat' ? 'Material Padat' : 'Material Bubuk'})</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                        Auto-Round Up
                      </span>
                    </h4>
                    <p className="text-[11px] text-amber-200/80">
                      Material padat & bubuk dari GDRM dikirim menyesuaikan kemasan pabrikasi (15 kg, 20 kg, 25 kg, 50 kg). Pengiriman dibulatkan ke atas dan secara otomatis mengubah Form Order resmi.
                    </p>
                  </div>
                </div>

                {/* Packaging Size Selector */}
                <div className="flex items-center space-x-1.5 self-end sm:self-auto">
                  <span className="text-[10px] font-semibold text-slate-400">Pilih Kemasan:</span>
                  {[15, 20, 25, 50].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setGdrmBagSize(size)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition ${
                        gdrmBagSize === size
                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 ring-1 ring-amber-400'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {size} kg
                    </button>
                  ))}
                </div>
              </div>

              {/* Metrics: Teoretis vs Kemasan vs Pembulatan vs Form Order */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Kebutuhan Batch WIP:</span>
                  <span className="font-mono font-bold text-slate-200 text-xs sm:text-sm">
                    {theoreticalNeed.toFixed(4)} <span className="text-[10px] text-slate-500">kg</span>
                  </span>
                  <span className="text-[10px] text-slate-500 block">({batchCount} batch formula)</span>
                </div>

                <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Kemasan Pabrikasi:</span>
                  <span className="font-mono font-bold text-amber-400 text-xs sm:text-sm">
                    {gdrmBagSize} <span className="text-[10px] text-slate-500">kg / Zak</span>
                  </span>
                  <span className="text-[10px] text-amber-500/90 block">Kemasan Standar GDRM</span>
                </div>

                <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Pembulatan ke Atas:</span>
                  <span className="font-mono font-bold text-cyan-400 text-xs sm:text-sm">
                    {bagCount} <span className="text-[10px] text-slate-500">Zak Utuh</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 block">
                    Surplus: +{surplusQty.toFixed(2)} kg
                  </span>
                </div>

                <div className="bg-gradient-to-br from-cyan-950/50 to-slate-900 p-2.5 rounded-lg border border-cyan-500/40">
                  <span className="text-[10px] text-cyan-300 font-semibold block mb-0.5">Form Order Dikirim:</span>
                  <span className="font-mono font-bold text-cyan-400 text-sm sm:text-base">
                    {roundedOrderQty.toFixed(4)} <span className="text-[10px] text-slate-400">kg</span>
                  </span>
                  <span className="text-[10px] text-cyan-300/80 block">Otomatis Disesuaikan</span>
                </div>
              </div>
            </div>
          )}

          {/* Total Qty (Autofill with manual edit capability) */}
          <div className={isGdrmSolid ? "sm:col-span-2" : ""}>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-medium text-slate-300">
                {isGdrmSolid ? 'Qty Form Order Resmi Dikirim ke GDRM (kg)' : 'Qty Total Permintaan (kg)'}
              </label>
              <span className="text-[10px] text-cyan-400 font-mono">
                {isGdrmSolid
                  ? `(Dibulatkan: ${bagCount} Zak @ ${gdrmBagSize} kg = ${roundedOrderQty.toFixed(4)} kg)`
                  : selectedMatObj ? `(Basis: ${selectedMatObj.weightKg.toFixed(4)} kg × ${batchCount})` : ''}
              </span>
            </div>
            <input
              type="number"
              step="0.0001"
              required
              value={totalQty}
              onChange={(e) => setTotalQty(e.target.value)}
              placeholder="0.0000"
              className={`w-full bg-slate-800 border rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-none ${
                isGdrmSolid
                  ? 'border-amber-500/50 text-cyan-300 text-sm'
                  : 'border-slate-700 text-cyan-400 text-xs focus:border-cyan-500'
              }`}
            />
            {isGdrmSolid && (
              <p className="text-[10px] text-amber-300 mt-1">
                ✓ Nilai formulir telah otomatis disesuaikan dengan kemasan pabrikasi {gdrmBagSize} kg ({bagCount} Zak). Surplus sebesar {surplusQty.toFixed(4)} kg akan masuk ke saldo gudang CK saat material diterima.
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Catatan Permintaan (Shift / Line Produksi)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Kebutuhan Shift 1 Line Wafer Ekspor KITE"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500"
            />
          </div>

          {/* Action CTAs: Step 1 Masukkan ke Keranjang & Opsi Kirim Langsung */}
          <div className="sm:col-span-2 pt-2 flex flex-col sm:flex-row items-center gap-2.5">
            <button
              type="submit"
              className="w-full sm:flex-1 py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-cyan-600/25 transition flex items-center justify-center space-x-2 active:scale-95 border border-cyan-400/30"
            >
              <ShoppingCart className="w-4 h-4 text-cyan-200" />
              <span>1. Masukkan ke Keranjang untuk Crosscheck</span>
              {cartItems.length > 0 && (
                <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono font-bold">
                  {cartItems.length} di keranjang
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleDirectSend}
              className="w-full sm:w-auto py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium transition flex items-center justify-center space-x-1.5 active:scale-95"
              title="Kirim permintaan 1 item ini langsung tanpa memasukkan ke keranjang"
            >
              <Send className="w-3.5 h-3.5 text-slate-400" />
              <span>Kirim Langsung</span>
            </button>
          </div>
        </form>
      </div>

      {/* STEP 2: KERANJANG PERMINTAAN MATERIAL & CROSSCHECK SECTION */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* Cart Header */}
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/30">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-sm text-white">Keranjang Permintaan Material</h3>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  cartItems.length > 0
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {cartItems.length} Item Siap Di-Crosscheck
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Tampung dan crosscheck seluruh pesanan material antar SKU & WIP sebelum dikirim resmi ke gudang.
              </p>
            </div>
          </div>

          {/* Quick Cart Actions (Dipisah Per Supplier & Jenis WIP) */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {cartItems.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handlePrintAllSlipsBySupplier}
                  disabled={isBatchPrintingPdf}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold border border-cyan-400/40 shadow-md shadow-cyan-600/20 transition flex items-center space-x-1.5 disabled:opacity-50"
                  title="Kelompokkan item berdasarkan supplier dan jenis WIP lalu unduh file PDF terpisah (otomatis lanjut ke lembar berikutnya jika >10 item)"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>
                    {isBatchPrintingPdf
                      ? 'Mencetak Slip...'
                      : cartItemsBySlipGroup.length > 1
                      ? `Cetak ${cartItemsBySlipGroup.length} Slip PDF (Supplier & WIP)`
                      : `Cetak Slip PDF (${cartItemsBySlipGroup[0]?.supplier || 'GDRM'} • ${cartItemsBySlipGroup[0]?.wipName || 'WIP'})`}
                  </span>
                </button>
                {cartItemsBySlipGroup.map(group => (
                  <button
                    key={group.key}
                    type="button"
                    onClick={() => handlePrintCart(group.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center space-x-1.5 ${
                      group.supplier === 'GDRM'
                        ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                        : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border-purple-500/40'
                    }`}
                    title={`Pratinjau & atur Slip Bon Permintaan RM & PM untuk ${group.supplier} — WIP ${group.wipName} (${group.items.length} item, ${group.pageCount} lembar A4)`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>
                      {group.supplier} • {group.wipName} ({group.items.length}
                      {group.pageCount > 1 ? ` • ${group.pageCount} lbr` : ''})
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClearCart}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-xl text-xs font-medium border border-rose-500/20 transition flex items-center space-x-1.5"
                  title="Kosongkan seluruh item dari keranjang"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Kosongkan</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Cart Summary Metrics Strip */}
        {cartItems.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 sm:p-4 bg-slate-950/70 border-b border-slate-800 text-xs">
            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-0.5">Total Item Permintaan:</span>
              <span className="font-mono font-bold text-white text-sm sm:text-base">
                {cartItems.length} <span className="text-[10px] text-slate-400 font-normal">Material</span>
              </span>
              <span className="text-[10px] text-slate-500 block">Antrean Crosscheck</span>
            </div>

            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-0.5">Total Tonase Form Order:</span>
              <span className="font-mono font-bold text-cyan-400 text-sm sm:text-base">
                {totalCartQty.toFixed(2)} <span className="text-[10px] text-slate-400">kg</span>
              </span>
              <span className="text-[10px] text-slate-500 block">
                Teoretis: {totalCartTheoretical.toFixed(2)} kg
              </span>
            </div>

            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-0.5">Pesanan Supplier GDRM:</span>
              <span className="font-mono font-bold text-amber-400 text-sm sm:text-base">
                {totalGdrmBags} <span className="text-[10px] text-slate-400">Zak</span>
              </span>
              <span className="text-[10px] text-amber-500/80 block">
                {gdrmCartItems.length} Item (Surplus: +{totalCartSurplus.toFixed(1)} kg)
              </span>
            </div>

            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-400 block mb-0.5">Pesanan Formulasi:</span>
              <span className="font-mono font-bold text-purple-400 text-sm sm:text-base">
                {formulasiCartItems.length} <span className="text-[10px] text-slate-400">Item</span>
              </span>
              <span className="text-[10px] text-purple-400/80 block">
                {formulasiCartItems.reduce((acc, curr) => acc + curr.qty, 0).toFixed(2)} kg Premix
              </span>
            </div>
          </div>
        )}

        {/* Cart Items Table (Dikelompokkan Per Supplier & Jenis WIP untuk Slip PDF Terpisah) */}
        {cartItems.length > 0 ? (
          <div className="divide-y divide-slate-800">
            {cartItemsBySlipGroup.map((group, groupIdx) => (
              <div key={group.key}>
                {/* Supplier + WIP Group Sub-header */}
                <div className="px-4 py-2.5 bg-slate-950/80 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border font-mono ${
                        group.supplier === 'GDRM'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                      }`}
                    >
                      SLIP #{groupIdx + 1} • SUPPLIER {group.supplier.toUpperCase()} • WIP:{' '}
                      {group.wipName.toUpperCase()}
                    </span>
                    <span className="text-[11px] text-slate-300 font-mono">
                      {group.items.length} Item ({group.pageCount} Lembar A4 @ 10 baris) •{' '}
                      {group.totalQty.toFixed(2)} kg
                      {group.totalBags > 0 ? ` (${group.totalBags} Zak)` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePrintCart(group.key)}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-semibold flex items-center space-x-1.5 transition"
                  >
                    <Printer className="w-3 h-3" />
                    <span>
                      Pratinjau &amp; Cetak ({group.supplier} • {group.wipName})
                    </span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-800/80 text-[11px] font-semibold text-slate-300 border-b border-slate-800">
                        <th className="py-2.5 px-3">No</th>
                        <th className="py-2.5 px-3">Material &amp; Kode</th>
                        <th className="py-2.5 px-3">Tujuan (SKU &amp; WIP)</th>
                        <th className="py-2.5 px-3 text-center">Batch</th>
                        <th className="py-2.5 px-3">Supplier &amp; Kemasan</th>
                        <th className="py-2.5 px-3 text-right">Qty Form Order (kg)</th>
                        <th className="py-2.5 px-3 text-right">Saldo Saat Ini</th>
                        <th className="py-2.5 px-3">Catatan</th>
                        <th className="py-2.5 px-3 text-center">Hapus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {group.items.map((item, index) => {
                        const sheetNum = Math.floor(index / REQUEST_SLIP_ROWS_PER_PAGE) + 1;
                        return (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3 font-mono text-slate-400">
                            <div className="flex items-center space-x-1">
                              <span>#{index + 1}</span>
                              {group.items.length > REQUEST_SLIP_ROWS_PER_PAGE && (
                                <span className="px-1 py-0.2 rounded text-[9px] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                  Lbr {sheetNum}
                                </span>
                              )}
                            </div>
                            <span className="block text-[9px] text-slate-500">{item.addedAt}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-white block">{item.materialName}</span>
                            <span className="text-[10px] text-cyan-400 font-mono">
                              {item.materialCode || item.materialId} • {item.materialType.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center space-x-1">
                              <span className="font-medium text-slate-200">{item.skuName}</span>
                              {item.isKite ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                                  KITE
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-700 text-slate-300 font-mono">
                                  DOM
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-amber-400/90 block">
                              WIP: {item.wipName}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-slate-300">
                            {item.batch.toFixed(2)}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              item.supplier === 'GDRM'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                            }`}>
                              {item.supplier}
                            </span>
                            {item.packageCount && item.packageSizeKg && (
                              <span className="block text-[10px] text-amber-400 font-mono font-medium mt-0.5">
                                {item.packageCount} Zak @ {item.packageSizeKg} kg
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono">
                            <span className="font-bold text-cyan-400 text-xs block">
                              {item.qty.toFixed(4)} kg
                            </span>
                            {item.surplusKg ? (
                              <span className="text-[9px] text-emerald-400 block font-normal">
                                +{item.surplusKg.toFixed(2)} kg (Kemasan)
                              </span>
                            ) : (
                              <span className="text-[9px] text-slate-500 block font-normal">
                                Acuan Batch
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-400">
                            {item.saldoAwal.toFixed(2)} kg
                          </td>
                          <td className="py-3 px-3 text-[11px] text-slate-400 max-w-[140px] truncate" title={item.notes || '-'}>
                            {item.notes || '-'}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveFromCart(item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                              title="Hapus dari keranjang"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 px-4 text-center">
            <div className="w-10 h-10 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center mx-auto mb-2">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-300 mb-0.5">Keranjang Permintaan Masih Kosong</p>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto">
              Pilih SKU, WIP, dan Material pada formulir di atas lalu klik tombol <strong className="text-cyan-400">"1. Masukkan ke Keranjang untuk Crosscheck"</strong> untuk menampung seluruh daftar belanja material sebelum diajukan resmi ke gudang.
            </p>
          </div>
        )}

        {/* Bottom Cart Verification Strip & Submit All Action */}
        {cartItems.length > 0 && (
          <div className="p-4 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-slate-400 text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>
                Langkah Verifikasi: Pastikan item, bobot batch, dan supplier telah sesuai sebelum mengklik tombol kirim.
              </span>
            </div>

            <button
              type="button"
              onClick={handleOpenCrosscheckModal}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-600/30 transition flex items-center justify-center space-x-2 active:scale-95 border border-emerald-400/30"
            >
              <Send className="w-4 h-4" />
              <span>2. Kirim Semua Permintaan Material ({cartItems.length} Item)</span>
            </button>
          </div>
        )}
      </div>

      {/* History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <FileText className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-white">History Permintaan Material</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {filteredRequests.some(r => r.status !== 'Received') && (
              <button
                type="button"
                onClick={() =>
                  handlePrintPendingHistoryBySupplier(
                    filteredRequests.filter(r => r.status !== 'Received')
                  )
                }
                disabled={isBatchPrintingPdf}
                className="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 disabled:opacity-50"
                title="Cetak semua permintaan berstatus Menunggu dalam file PDF terpisah per Supplier & WIP"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Slip Pending (Per Supplier &amp; WIP)</span>
              </button>
            )}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchHistory}
                onChange={(e) => setSearchHistory(e.target.value)}
                placeholder="Cari no req / material..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/60 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                <th className="py-2.5 px-3">No. Req / Tanggal</th>
                <th className="py-2.5 px-3">SKU Produk</th>
                <th className="py-2.5 px-3">WIP Terkait</th>
                <th className="py-2.5 px-3">Nama Material</th>
                <th className="py-2.5 px-3 text-right">Qty Form Order (kg)</th>
                <th className="py-2.5 px-3 text-right">Saldo Awal</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredRequests.length > 0 ? (
                filteredRequests.map((req, idx) => {
                  const sObj = state.master.skus.find(s => s.id === req.skuId);
                  const wObj = state.master.wips.find(w => w.id === req.wipId);
                  const mObj = state.master.materials.find(m => m.id === req.materialId);

                  return (
                    <tr key={`${req.id}_${idx}`} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono font-semibold text-white block">{req.requestNumber}</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold font-mono">
                            Shift {req.shift || 1}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">{req.date}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-white block">{sObj ? sObj.name : '-'}</span>
                        <span className={`text-[10px] ${sObj?.isKite ? 'text-amber-400 font-semibold' : 'text-slate-400'}`}>
                          {sObj?.isKite ? 'Ekspor KITE' : 'Domestik'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {wObj ? wObj.name : '-'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-white block">{mObj ? mObj.name : '-'}</span>
                        <span className="text-[10px] text-cyan-400">Supplier: {req.supplier}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        <span className="font-bold text-cyan-400 block text-xs">
                          {req.qty.toFixed(4)} kg
                        </span>
                        {req.packageCount && req.packageSizeKg ? (
                          <div className="space-y-0.5">
                            <span className="inline-block px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                              {req.packageCount} Zak @ {req.packageSizeKg} kg
                            </span>
                            <span className="block text-[9px] text-slate-400">
                              Kebutuhan: {req.theoreticalQty?.toFixed(2)} kg (+{req.surplusKg?.toFixed(2)} kg)
                            </span>
                          </div>
                        ) : (
                          <span className="block text-[10px] text-slate-400 font-normal">
                            {req.batch.toFixed(4)} batch
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-400">
                        {req.saldoAwal.toFixed(4)} kg
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] border font-medium ${
                          req.status === 'Received'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        }`}>
                          {req.status === 'Received' ? 'Diterima' : 'Menunggu'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handlePrintHistoryRequest(req)}
                            className="p-1.5 bg-cyan-600/15 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 rounded-lg transition active:scale-95"
                            title={`Cetak Slip PDF & QR untuk ${req.requestNumber}`}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {req.status !== 'Received' ? (
                            <button
                              onClick={() => onJumpToReceive(req)}
                              className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 rounded-lg text-[10px] font-semibold transition active:scale-95 inline-flex items-center space-x-1"
                            >
                              <span>Terima</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500 flex items-center justify-center space-x-1">
                              <CheckCircle className="w-3 h-3 text-emerald-500" />
                              <span>Selesai</span>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-500 text-xs">
                    Belum ada riwayat permintaan material. Silakan buat permintaan melalui formulir di atas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL VERIFIKASI & CROSSCHECK PENGIRIMAN MATERIAL */}
      {isCrosscheckModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-950/40">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white">
                    Verifikasi & Crosscheck Pesanan Material
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Cek dan pastikan seluruh item ({cartItems.length} item) sebelum pesanan disubmit resmi ke gudang.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCrosscheckModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content - Scrollable List */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
              {/* Summary Metric Chips */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-center">
                <div>
                  <span className="text-[10px] text-slate-400 block">Total Item</span>
                  <span className="font-mono font-bold text-white text-sm">{cartItems.length} Material</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Total Berat Kirim</span>
                  <span className="font-mono font-bold text-cyan-400 text-sm">{totalCartQty.toFixed(2)} kg</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Supplier</span>
                  <span className="font-mono font-bold text-amber-400 text-xs">
                    {gdrmCartItems.length} GDRM / {formulasiCartItems.length} Formulasi
                  </span>
                </div>
              </div>

              {/* Items List Preview */}
              <div>
                <h4 className="font-bold text-slate-200 mb-2 flex items-center justify-between">
                  <span>Daftar Material yang Akan Diajukan:</span>
                  <span className="text-[11px] text-slate-400 font-normal">Periksa kesesuaian SKU & WIP</span>
                </h4>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {cartItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-xl flex items-center justify-between gap-3 transition"
                    >
                      <div className="flex items-center space-x-2.5 min-w-0">
                        <span className="font-mono font-bold text-slate-400 text-xs flex-shrink-0">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-white truncate">{item.materialName}</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                              item.supplier === 'GDRM'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-purple-500/20 text-purple-300'
                            }`}>
                              {item.supplier}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 block truncate">
                            Untuk: <strong className="text-slate-300">{item.skuName}</strong> ({item.wipName})
                          </span>
                          {item.notes && (
                            <span className="text-[10px] text-slate-500 italic block truncate">
                              Catatan: {item.notes}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="font-mono font-bold text-cyan-400 block text-xs sm:text-sm">
                          {item.qty.toFixed(2)} kg
                        </span>
                        {item.packageCount && item.packageSizeKg ? (
                          <span className="text-[9px] font-mono text-amber-300 block">
                            {item.packageCount} Zak @ {item.packageSizeKg} kg
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-400 block">
                            {item.batch.toFixed(2)} Batch
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Operator Verification Checklist */}
              <div
                onClick={() => setIsCrosscheckVerified(!isCrosscheckVerified)}
                className={`p-3.5 rounded-xl border cursor-pointer transition flex items-start space-x-3 ${
                  isCrosscheckVerified
                    ? 'bg-emerald-950/30 border-emerald-500/50 text-emerald-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="mt-0.5">
                  {isCrosscheckVerified ? (
                    <CheckSquare className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-500" />
                  )}
                </div>
                <div>
                  <span className="font-bold block text-xs text-white">
                    Konfirmasi & Verifikasi Pesanan Operator
                  </span>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                    Saya menyatakan telah mencocokkan jumlah material, target SKU/WIP, dan pembulatan kemasan pabrikasi GDRM dengan kebutuhan jadwal produksi shift berjalan.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handlePrintAllSlipsBySupplier}
                  disabled={isBatchPrintingPdf}
                  className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 border border-cyan-400/40 transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  <Printer className="w-4 h-4" />
                  <span>
                    {cartItemsBySlipGroup.length > 1
                      ? `Unduh ${cartItemsBySlipGroup.length} Slip PDF (Supplier & WIP)`
                      : `Unduh Slip PDF (${cartItemsBySlipGroup[0]?.supplier || 'GDRM'} • ${cartItemsBySlipGroup[0]?.wipName || 'WIP'})`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintCart(cartItemsBySlipGroup[0]?.key)}
                  className="px-3 py-2.5 rounded-xl text-xs font-semibold text-cyan-300 hover:text-white bg-cyan-600/15 hover:bg-cyan-600/30 border border-cyan-500/40 transition"
                >
                  Pratinjau
                </button>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsCrosscheckModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 transition"
                >
                  Kembali & Periksa Keranjang
                </button>

                <button
                  type="button"
                  onClick={handleConfirmAndSendAll}
                  disabled={!isCrosscheckVerified}
                  className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-lg ${
                    isCrosscheckVerified
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/30 active:scale-95 border border-emerald-400/40'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-800'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  <span>Kirim Semua Permintaan ({cartItems.length} Item)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CETAK SLIP PDF FORMAT BON PERMINTAAN RM & PM */}
      <RequestSlipPdfModal
        isOpen={isSlipPdfModalOpen}
        onClose={() => {
          setIsSlipPdfModalOpen(false);
          setSlipModalCustomItems(null);
          setSlipModalRequestNumbers(undefined);
          setSlipModalGroupKey(undefined);
        }}
        state={state}
        cartItems={slipModalCustomItems || cartItems}
        initialGroupKey={slipModalGroupKey}
        initialSupplier={slipModalSupplier}
        requestNumbers={slipModalRequestNumbers}
        onPreviewQrDetail={data => setActiveQrDetailData(data)}
        showToast={showToast}
      />

      {/* MODAL DETAIL PERMINTAAN MATERIAL DARI QR SLIP */}
      {activeQrDetailData && (() => {
        const matchedRequests = state.transactions.requests.filter(req => {
          if (activeQrDetailData.requestNumbers.includes(req.requestNumber)) return true;
          if (activeQrDetailData.supplier && req.supplier !== activeQrDetailData.supplier) return false;
          const mat = state.master.materials.find(m => m.id === req.materialId);
          return activeQrDetailData.items.some(
            it =>
              (mat?.code && it.code.toLowerCase() === mat.code.toLowerCase()) ||
              (mat?.name && it.code.toLowerCase() === mat.name.toLowerCase())
          );
        });

        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-950/40">
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-white flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-cyan-400" />
                    <span>Detail Permintaan Material (QR Slip)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Bon: {activeQrDetailData.bonNumber} • Supplier: {activeQrDetailData.supplier || '-'}
                    {activeQrDetailData.wipName ? ` • WIP: ${activeQrDetailData.wipName}` : ''}
                    {activeQrDetailData.pageInfo ? ` • Lembar ${activeQrDetailData.pageInfo}` : ''} • Tanggal:{' '}
                    {activeQrDetailData.tanggal || '-'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveQrDetailData(null);
                    onClearDeepLinkSlip?.();
                  }}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-4 text-xs">
                {/* Encoded Items from QR */}
                <div>
                  <h4 className="font-bold text-slate-200 mb-2">
                    Daftar Item Pada Slip ({activeQrDetailData.items.length} Item):
                  </h4>
                  <div className="overflow-x-auto border border-slate-800 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-800/70 text-[11px] text-slate-300 border-b border-slate-800">
                          <th className="py-2 px-3">No</th>
                          <th className="py-2 px-3">Kode SAP / Material</th>
                          <th className="py-2 px-3">Nama Material (BOM)</th>
                          <th className="py-2 px-3 text-right">Jumlah Diminta</th>
                          <th className="py-2 px-3 text-center">SAT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {activeQrDetailData.items.map((it, idx) => {
                          const bomMat = state.master.materials.find(
                            m =>
                              (m.code && m.code.toLowerCase() === it.code.toLowerCase()) ||
                              m.name.toLowerCase() === it.code.toLowerCase()
                          );
                          return (
                            <tr key={`${it.code}_${idx}`}>
                              <td className="py-2 px-3 font-mono text-slate-400">#{idx + 1}</td>
                              <td className="py-2 px-3 font-mono text-cyan-300 font-semibold">
                                {bomMat?.code || it.code}
                              </td>
                              <td className="py-2 px-3 text-white font-medium">
                                {bomMat?.name || it.code}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-white">
                                {it.qty}
                              </td>
                              <td className="py-2 px-3 text-center font-mono text-amber-300">
                                {it.sat}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Matched Live Requests in Database */}
                <div>
                  <h4 className="font-bold text-slate-200 mb-2">
                    Status Permintaan Terdaftar di Aplikasi ({matchedRequests.length}):
                  </h4>
                  {matchedRequests.length > 0 ? (
                    <div className="space-y-2">
                      {matchedRequests.map(req => {
                        const mat = state.master.materials.find(m => m.id === req.materialId);
                        const sku = state.master.skus.find(s => s.id === req.skuId);
                        return (
                          <div
                            key={req.id}
                            className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl flex items-center justify-between gap-3"
                          >
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-mono font-bold text-white">
                                  {req.requestNumber}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                    req.status === 'Received'
                                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                  }`}
                                >
                                  {req.status === 'Received' ? 'Diterima' : 'Menunggu'}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-300 mt-0.5">
                                {mat?.code ? `[${mat.code}] ` : ''}
                                {mat?.name || 'Material'} • {req.qty.toFixed(2)} kg • SKU: {sku?.name || '-'}
                              </div>
                            </div>
                            {req.status !== 'Received' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveQrDetailData(null);
                                  onClearDeepLinkSlip?.();
                                  onJumpToReceive(req);
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold flex items-center space-x-1 shrink-0"
                              >
                                <span>Terima Inbound</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 bg-slate-950/70 border border-slate-800 rounded-xl p-3">
                      Belum ditemukan nomor permintaan yang tersimpan di riwayat untuk item ini (kemungkinan slip dicetak dari draft keranjang sebelum dikirim resmi).
                    </p>
                  )}
                </div>
              </div>

              <div className="p-3.5 border-t border-slate-800 bg-slate-950 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setActiveQrDetailData(null);
                    onClearDeepLinkSlip?.();
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
                >
                  Tutup Detail
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

