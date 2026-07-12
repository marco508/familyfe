// app/(app)/(tabs)/maison.tsx
// Membres de la maison active (rôles, ajout par le chef, retrait), code
// d'invitation partageable, classement des points, anniversaires, profil
// utilisateur (éditable, dont date de naissance) et déconnexion.
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Share,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  UserPlus,
  LogOut,
  Trash2,
  Share2,
  Pencil,
  Cake,
  Camera,
  UserCog,
  Baby,
  Crown,
  X,
  DoorOpen,
  Plus,
  Settings2,
} from 'lucide-react-native';
import { useMaison } from '../../src/contexts/MaisonContext';
import { useAuth } from '../../src/contexts/AuthContext';
import { useNotifications } from '../../src/contexts/NotificationContext';
import { useT } from '../../src/i18n';
import { logementIcon, logementLabel } from '../../src/utils/logement';
import maisonService, { Anniversaire, LienFamille, Membre, TypeLogement } from '../../src/services/maisonService';
import authService from '../../src/services/authService';
import rolesService, { RoleUpdateInput } from '../../src/services/rolesService';
import pieceService, { Piece, TypePiece } from '../../src/services/pieceService';
import {
  CandyButton,
  CandyCard,
  CandyInput,
  SectionTitle,
  Badge,
  Avatar,
  EmptyState,
  NotificationBell,
  Segmented,
  VisitorBanner,
} from '../../components/ui';
import { typography, spacing, borderRadius } from '../../theme/designTokens';
import { useTheme } from '../../src/contexts/ThemeContext';

const MEDALS = ['🥇', '🥈', '🥉'];
const TYPES_PIECE: TypePiece[] = ['chambre', 'salon', 'cuisine', 'salle_de_bain', 'bureau', 'garage', 'autre'];
const LIENS_FAMILLE: LienFamille[] = ['pere', 'mere', 'enfant', 'frere', 'soeur', 'conjoint', 'autre'];

// i18n key for a `LienFamille` value : la plupart correspondent au nom exact
// (ex: "pere" -> "maison.pere"), sauf "enfant" et "autre" qui entrent en
// conflit avec d'autres clés existantes ("enfant" = profil enfant V3).
function lienFamilleKey(lien: LienFamille): string {
  if (lien === 'enfant') return 'enfantLien';
  if (lien === 'autre') return 'autreLien';
  return lien;
}

export default function MaisonScreen() {
  const { colors } = useTheme();
  const {
    maisonActive,
    membres,
    isChef,
    isGestion,
    isVisiteur,
    loadingMembres,
    refreshMembres,
    refresh: refreshMaisons,
  } = useMaison();
  const { user, logout, refreshProfile } = useAuth();
  const { unreadCount, refresh: refreshNotifCount } = useNotifications();
  const { t } = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [anniversaires, setAnniversaires] = useState<Anniversaire[]>([]);

  const [editingProfile, setEditingProfile] = useState(false);
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [roleBusyId, setRoleBusyId] = useState<number | null>(null);

  // ANNEXE V4 — Logement (bloc éditable par la gestion).
  const [editingLogement, setEditingLogement] = useState(false);
  const [typeLogement, setTypeLogement] = useState<TypeLogement>('maison');
  const [adresse, setAdresse] = useState('');
  const [complement, setComplement] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [ville, setVille] = useState('');
  const [pays, setPays] = useState('');
  const [etage, setEtage] = useState('');
  const [numeroAppartement, setNumeroAppartement] = useState('');
  const [digicode, setDigicode] = useState('');
  const [interphone, setInterphone] = useState('');
  const [acces, setAcces] = useState('');
  const [surface, setSurface] = useState('');
  const [savingLogement, setSavingLogement] = useState(false);
  const [logementError, setLogementError] = useState('');

  // ANNEXE V4 — Pièces.
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loadingPieces, setLoadingPieces] = useState(false);
  const [pieceModalVisible, setPieceModalVisible] = useState(false);
  const [editingPiece, setEditingPiece] = useState<Piece | null>(null);
  const [pieceNom, setPieceNom] = useState('');
  const [pieceType, setPieceType] = useState<TypePiece>('chambre');
  const [pieceAffecteA, setPieceAffecteA] = useState<number | null>(null);
  const [savingPiece, setSavingPiece] = useState(false);
  const [pieceError, setPieceError] = useState('');

  // ANNEXE V4 — Rôle avancé (co-chef / chef temporaire / visiteur / lien familial).
  const [roleModalMembre, setRoleModalMembre] = useState<Membre | null>(null);
  const [roleModalRole, setRoleModalRole] = useState<'membre' | 'co_chef' | 'chef_temporaire' | 'visiteur'>('membre');
  const [roleModalLien, setRoleModalLien] = useState<LienFamille | null>(null);
  const [roleModalExpireLe, setRoleModalExpireLe] = useState('');
  const [savingRoleAvance, setSavingRoleAvance] = useState(false);
  const [roleModalError, setRoleModalError] = useState('');

  const loadAnniversaires = useCallback(async () => {
    if (!maisonActive) {
      setAnniversaires([]);
      return;
    }
    const res = await maisonService.anniversaires(maisonActive.id);
    setAnniversaires(res.data ?? []);
  }, [maisonActive]);

  const loadPieces = useCallback(async () => {
    if (!maisonActive) {
      setPieces([]);
      return;
    }
    setLoadingPieces(true);
    const res = await pieceService.list(maisonActive.id);
    setPieces(res.data ?? []);
    setLoadingPieces(false);
  }, [maisonActive]);

  useFocusEffect(
    useCallback(() => {
      refreshMembres();
      loadAnniversaires();
      loadPieces();
      refreshNotifCount();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshMembres, loadAnniversaires, loadPieces])
  );

  useEffect(() => {
    if (maisonActive) {
      setTypeLogement(maisonActive.type_logement || 'maison');
      setAdresse(maisonActive.adresse || '');
      setComplement(maisonActive.complement || '');
      setCodePostal(maisonActive.code_postal || '');
      setVille(maisonActive.ville || '');
      setPays(maisonActive.pays || '');
      setEtage(maisonActive.etage || '');
      setNumeroAppartement(maisonActive.numero_appartement || '');
      setDigicode(maisonActive.digicode || '');
      setInterphone(maisonActive.interphone || '');
      setAcces(maisonActive.acces || '');
      setSurface(maisonActive.surface != null ? String(maisonActive.surface) : '');
    }
  }, [maisonActive]);

  useEffect(() => {
    if (user) {
      setNom(user.nom || '');
      setEmail(user.email || '');
      setTelephone(user.telephone || '');
      setDateNaissance(user.date_naissance || '');
    }
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshMaisons(), refreshMembres(), loadAnniversaires()]);
    setRefreshing(false);
  };

  const handleShareCode = async () => {
    if (!maisonActive) return;
    try {
      await Share.share({
        message: `${t('maison.rejoindrePrefix')} "${maisonActive.nom}" ${t('maison.rejoindreSuffix')} ${maisonActive.code_invitation}`,
      });
    } catch {
      // ignore
    }
  };

  const handleRemoveMembre = (membreId: number, nomMembre: string) => {
    if (!maisonActive) return;
    Alert.alert(t('maison.retirerMembreTitre'), `${nomMembre} ${t('maison.retirerMembreMessage')}`, [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('maison.retirerAction'),
        style: 'destructive',
        onPress: async () => {
          const res = await maisonService.removeMembre(maisonActive.id, membreId);
          if (res.error) {
            Alert.alert(t('common.erreur'), res.error);
            return;
          }
          refreshMembres();
        },
      },
    ]);
  };

  const handleQuitter = () => {
    if (!maisonActive || !user) return;
    Alert.alert(t('maison.quitterMaisonTitre'), `${t('maison.quitterMaisonMessage')} "${maisonActive.nom}".`, [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('maison.quitterAction'),
        style: 'destructive',
        onPress: async () => {
          const res = await maisonService.removeMembre(maisonActive.id, user.id);
          if (res.error) {
            Alert.alert(t('maison.impossibleQuitter'), res.error);
            return;
          }
          refreshMaisons();
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert(t('maison.deconnexionTitre'), '', [
      { text: t('common.annuler'), style: 'cancel' },
      { text: t('common.deconnexion'), style: 'destructive', onPress: logout },
    ]);
  };

  // ---- ANNEXE V3 — rôles (promouvoir co-chef, marquer enfant) ----
  const handleToggleCoChef = (m: Membre) => {
    if (!maisonActive) return;
    const nextRole: 'co_chef' | 'membre' = m.role === 'co_chef' ? 'membre' : 'co_chef';
    Alert.alert(
      (nextRole === 'co_chef' ? t('maison.promouvoirCoChef') : t('maison.retrograderMembre')) + ' ?',
      m.nom,
      [
        { text: t('common.annuler'), style: 'cancel' },
        {
          text: t('common.confirmer'),
          onPress: async () => {
            setRoleBusyId(m.id);
            const res = await rolesService.setRole(maisonActive.id, m.id, { role: nextRole, est_enfant: m.est_enfant });
            setRoleBusyId(null);
            if (res.error) {
              Alert.alert(t('common.erreur'), res.error);
              return;
            }
            refreshMembres();
          },
        },
      ]
    );
  };

  const handleToggleEnfant = async (m: Membre) => {
    if (!maisonActive) return;
    const role: 'co_chef' | 'membre' = m.role === 'co_chef' ? 'co_chef' : 'membre';
    setRoleBusyId(m.id);
    const res = await rolesService.setRole(maisonActive.id, m.id, { role, est_enfant: !m.est_enfant });
    setRoleBusyId(null);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    refreshMembres();
  };

  // ---- ANNEXE V3 — transfert de chef (chef only) ----
  const handleTransfererChef = (m: Membre) => {
    if (!maisonActive) return;
    Alert.alert(
      t('maison.transfererChef') + ' ?',
      `${m.nom} deviendra chef de la maison. Vous deviendrez membre.`,
      [
        { text: t('common.annuler'), style: 'cancel' },
        {
          text: t('common.confirmer'),
          style: 'destructive',
          onPress: async () => {
            setRoleBusyId(m.id);
            const res = await rolesService.transfererChef(maisonActive.id, m.id);
            setRoleBusyId(null);
            if (res.error) {
              Alert.alert(t('common.erreur'), res.error);
              return;
            }
            await Promise.all([refreshMaisons(), refreshMembres()]);
          },
        },
      ]
    );
  };

  // ---- ANNEXE V4 — rôle avancé (co-chef / chef temporaire / visiteur / lien familial) ----
  const openRoleAvance = (m: Membre) => {
    setRoleModalMembre(m);
    setRoleModalRole(m.role === 'chef' ? 'membre' : (m.role as any));
    setRoleModalLien(m.lien_famille ?? null);
    // L'API renvoie un datetime ISO complet ("2026-08-01T00:00:00") mais le champ
    // n'accepte/valide que la date ("AAAA-MM-JJ") : on tronque, sinon la validation
    // (regex date-only) rejette à tort une valeur déjà enregistrée non modifiée.
    const expire = m.role_expire_le || m.visite_expire_le || '';
    setRoleModalExpireLe(expire ? expire.slice(0, 10) : '');
    setRoleModalError('');
  };

  const handleSaveRoleAvance = async () => {
    if (!maisonActive || !roleModalMembre) return;
    if (
      (roleModalRole === 'chef_temporaire' || roleModalRole === 'visiteur') &&
      roleModalExpireLe.trim() &&
      !/^\d{4}-\d{2}-\d{2}$/.test(roleModalExpireLe.trim())
    ) {
      setRoleModalError(t('maison.dateInvalide'));
      return;
    }
    setSavingRoleAvance(true);
    setRoleModalError('');
    const data: RoleUpdateInput = {
      role: roleModalRole,
      lien_famille: roleModalLien,
      expire_le: roleModalExpireLe.trim() || undefined,
    };
    const res = await rolesService.setRole(maisonActive.id, roleModalMembre.id, data);
    setSavingRoleAvance(false);
    if (res.error) {
      setRoleModalError(res.error);
      return;
    }
    setRoleModalMembre(null);
    refreshMembres();
  };

  // ---- ANNEXE V4 — Logement (gestion) ----
  const openEditLogement = () => {
    setLogementError('');
    setEditingLogement(true);
  };

  const handleSaveLogement = async () => {
    if (!maisonActive) return;
    setSavingLogement(true);
    setLogementError('');
    const res = await maisonService.update(maisonActive.id, {
      type_logement: typeLogement,
      adresse: adresse.trim() || undefined,
      complement: complement.trim() || undefined,
      code_postal: codePostal.trim() || undefined,
      ville: ville.trim() || undefined,
      pays: pays.trim() || undefined,
      etage: etage.trim() || undefined,
      numero_appartement: numeroAppartement.trim() || undefined,
      digicode: digicode.trim() || undefined,
      interphone: interphone.trim() || undefined,
      acces: acces.trim() || undefined,
      surface: surface.trim() ? Number(surface.trim()) : null,
    });
    setSavingLogement(false);
    if (res.error) {
      setLogementError(res.error);
      return;
    }
    await refreshMaisons();
    setEditingLogement(false);
  };

  // ---- ANNEXE V4 — Pièces (gestion) ----
  const openCreatePiece = () => {
    setEditingPiece(null);
    setPieceNom('');
    setPieceType('chambre');
    setPieceAffecteA(null);
    setPieceError('');
    setPieceModalVisible(true);
  };

  const openEditPiece = (p: Piece) => {
    setEditingPiece(p);
    setPieceNom(p.nom);
    setPieceType(p.type);
    setPieceAffecteA(p.affecte_a);
    setPieceError('');
    setPieceModalVisible(true);
  };

  const handleSavePiece = async () => {
    if (!maisonActive || !pieceNom.trim()) {
      setPieceError(t('pieces.nom'));
      return;
    }
    setSavingPiece(true);
    setPieceError('');
    const res = editingPiece
      ? await pieceService.update(editingPiece.id, { nom: pieceNom.trim(), type: pieceType, affecte_a: pieceAffecteA })
      : await pieceService.create(maisonActive.id, { nom: pieceNom.trim(), type: pieceType, affecte_a: pieceAffecteA });
    setSavingPiece(false);
    if (res.error) {
      setPieceError(res.error);
      return;
    }
    setPieceModalVisible(false);
    loadPieces();
    refreshMaisons();
  };

  const handleDeletePiece = (p: Piece) => {
    Alert.alert(t('pieces.supprimerConfirmTitre'), p.nom, [
      { text: t('common.annuler'), style: 'cancel' },
      {
        text: t('common.supprimer'),
        style: 'destructive',
        onPress: async () => {
          await pieceService.remove(p.id);
          loadPieces();
          refreshMaisons();
        },
      },
    ]);
  };

  // ---- ANNEXE V3 — avatar (upload) ----
  const handlePickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('maison.permissionRefusee'), t('maison.permissionRefuseeMessage'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setUploadingAvatar(true);
    const res = await authService.uploadAvatar(result.assets[0].uri);
    setUploadingAvatar(false);
    if (res.error) {
      Alert.alert(t('common.erreur'), res.error);
      return;
    }
    await refreshProfile();
  };

  const openEditProfile = () => {
    if (user) {
      setNom(user.nom || '');
      setEmail(user.email || '');
      setTelephone(user.telephone || '');
      setDateNaissance(user.date_naissance || '');
    }
    setProfileError('');
    setEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    if (!nom.trim() || !email.trim()) {
      setProfileError(t('maison.nomEmailObligatoires'));
      return;
    }
    if (dateNaissance.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(dateNaissance.trim())) {
      setProfileError(t('maison.dateNaissanceInvalide'));
      return;
    }
    setSavingProfile(true);
    setProfileError('');
    const res = await authService.updateProfile({
      nom: nom.trim(),
      email: email.trim().toLowerCase(),
      telephone: telephone.trim() || null,
      date_naissance: dateNaissance.trim() || null,
    });
    setSavingProfile(false);
    if (res.error) {
      setProfileError(res.error);
      return;
    }
    await refreshProfile();
    setEditingProfile(false);
  };

  const classement = [...membres].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  const anniversairesAffiches = anniversaires.slice(0, 5);

  if (!maisonActive) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <EmptyState emoji="🏠" title={t('accueil.aucuneMaison')} />
      </ScrollView>
    );
  }

  return (
    <>
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary.main} />}
    >
      <SectionTitle
        title={t('maison.maMaison')}
        emoji={logementIcon(maisonActive.type_logement)}
        right={<NotificationBell count={unreadCount} onPress={() => router.push('/(app)/notifications')} />}
      />

      {isVisiteur ? <VisitorBanner /> : null}

      <CandyCard style={styles.maisonCard}>
        <View style={styles.maisonHeaderRow}>
          <Text style={styles.maisonEmoji}>{maisonActive.emoji}</Text>
          <View style={{ flex: 1 }}>
            <View style={styles.maisonNomRow}>
              <Text style={[styles.maisonNom, { color: colors.text.dark }]}>{maisonActive.nom}</Text>
              <View style={[styles.logementChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={styles.logementChipIcon}>{logementIcon(maisonActive.type_logement)}</Text>
                <Text style={[styles.logementChipText, { color: colors.text.body }]}>
                  {logementLabel(t, maisonActive.type_logement)}
                </Text>
              </View>
            </View>
            <Text style={[styles.maisonMeta, { color: colors.text.body }]}>
              {membres.length} {membres.length > 1 ? t('accueil.membres') : t('accueil.membre')}
            </Text>
          </View>
        </View>

        <Pressable onPress={handleShareCode} style={[styles.codeRow, { backgroundColor: colors.surface }]}>
          <View>
            <Text style={[styles.codeLabel, { color: colors.text.muted }]}>{t('maison.codeInvitation')}</Text>
            <Text style={[styles.codeValue, { color: colors.text.dark }]}>{maisonActive.code_invitation}</Text>
          </View>
          <View style={[styles.shareButton, { backgroundColor: colors.primary.main }]}>
            <Share2 size={16} color={colors.candy.white} />
            <Text style={[styles.shareButtonText, { color: colors.candy.white }]}>{t('maison.partager')}</Text>
          </View>
        </Pressable>
      </CandyCard>

      {/* ANNEXE V4 — Logement */}
      <SectionTitle
        title={t('maison.logementSection')}
        emoji="🏡"
        right={
          isGestion && !editingLogement ? (
            <Pressable onPress={openEditLogement} hitSlop={8} style={[styles.editButton, { backgroundColor: colors.primary.subtle }]}>
              <Pencil size={16} color={colors.primary.main} />
            </Pressable>
          ) : undefined
        }
      />
      <CandyCard style={{ marginBottom: spacing.xl }}>
        {!editingLogement ? (
          <>
            <View style={styles.logementRow}>
              <Text style={styles.logementIconText}>{logementIcon(typeLogement)}</Text>
              <Text style={[styles.logementText, { color: colors.text.dark }]}>
                {logementLabel(t, typeLogement)}
              </Text>
            </View>
            <Text style={[styles.logementDetail, { color: colors.text.body }]}>
              {adresse || complement || ville
                ? [adresse, complement, [codePostal, ville].filter(Boolean).join(' '), pays].filter(Boolean).join(', ')
                : t('logement.nonRenseigne')}
            </Text>
            {typeLogement === 'appartement' && (etage || numeroAppartement || digicode || interphone) ? (
              <Text style={[styles.logementDetail, { color: colors.text.muted }]}>
                {[
                  etage ? `${t('logement.etage')} ${etage}` : '',
                  numeroAppartement ? `${t('logement.numeroAppartement')} ${numeroAppartement}` : '',
                  digicode ? `${t('logement.digicode')} ${digicode}` : '',
                  interphone ? `${t('logement.interphone')} ${interphone}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
            {acces ? <Text style={[styles.logementDetail, { color: colors.text.muted }]}>{acces}</Text> : null}
            {surface ? <Text style={[styles.logementDetail, { color: colors.text.muted }]}>{surface} m²</Text> : null}
          </>
        ) : (
          <>
            <Text style={[styles.label, { color: colors.text.dark }]}>{t('logement.type')}</Text>
            <Segmented
              value={typeLogement}
              onChange={setTypeLogement}
              options={[
                { value: 'maison', label: t('logement.maison') },
                { value: 'appartement', label: t('logement.appartement') },
              ]}
            />
            <View style={{ marginTop: spacing.lg }}>
              <CandyInput label={t('logement.adresse')} value={adresse} onChangeText={setAdresse} />
              <CandyInput label={t('logement.complement')} value={complement} onChangeText={setComplement} />
              <CandyInput label={t('logement.codePostal')} value={codePostal} onChangeText={setCodePostal} keyboardType="number-pad" />
              <CandyInput label={t('logement.ville')} value={ville} onChangeText={setVille} />
              <CandyInput label={t('logement.pays')} value={pays} onChangeText={setPays} />
              {typeLogement === 'appartement' ? (
                <>
                  <CandyInput label={t('logement.etage')} value={etage} onChangeText={setEtage} />
                  <CandyInput label={t('logement.numeroAppartement')} value={numeroAppartement} onChangeText={setNumeroAppartement} />
                  <CandyInput label={t('logement.digicode')} value={digicode} onChangeText={setDigicode} />
                  <CandyInput label={t('logement.interphone')} value={interphone} onChangeText={setInterphone} />
                </>
              ) : null}
              <CandyInput label={t('logement.acces')} value={acces} onChangeText={setAcces} multiline />
              <CandyInput label={t('logement.surface')} value={surface} onChangeText={setSurface} keyboardType="numeric" />
            </View>
            {logementError ? <Text style={[styles.error, { color: colors.candy.red }]}>{logementError}</Text> : null}
            <View style={styles.profileActionsRow}>
              <CandyButton label={t('common.annuler')} onPress={() => setEditingLogement(false)} variant="ghost" style={{ flex: 1 }} />
              <CandyButton label={t('common.enregistrer')} onPress={handleSaveLogement} loading={savingLogement} variant="pink" style={{ flex: 1 }} />
            </View>
          </>
        )}
      </CandyCard>

      {/* ANNEXE V4 — Pièces */}
      <SectionTitle
        title={t('maison.piecesSection')}
        emoji="🚪"
        right={
          isGestion ? (
            <Pressable onPress={openCreatePiece} style={[styles.addButton, { backgroundColor: colors.primary.main }]}>
              <Plus size={18} color={colors.candy.white} />
            </Pressable>
          ) : undefined
        }
      />
      {loadingPieces ? (
        <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary.main} />
      ) : pieces.length === 0 ? (
        <CandyCard style={{ marginBottom: spacing.xl }}>
          <Text style={[styles.emptyInlineText, { color: colors.text.body }]}>{t('pieces.aucunePiece')}</Text>
        </CandyCard>
      ) : (
        <View style={{ marginBottom: spacing.xl }}>
          {pieces.map((p) => (
            <CandyCard key={p.id} style={styles.leaderboardCard}>
              <View style={styles.membreRow}>
                <DoorOpen size={20} color={colors.candy.purpleDark} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.membreNom, { color: colors.text.dark }]}>{p.nom}</Text>
                  <Text style={[styles.membreEmail, { color: colors.text.body }]}>
                    {t(`pieces.${p.type === 'salle_de_bain' ? 'salleDeBain' : p.type}`)}
                    {' · '}
                    {p.membre ? p.membre.nom : t('pieces.personne')}
                  </Text>
                </View>
                {isGestion ? (
                  <View style={styles.pieceActionsRow}>
                    <Pressable onPress={() => openEditPiece(p)} hitSlop={8}>
                      <Pencil size={16} color={colors.primary.main} />
                    </Pressable>
                    <Pressable onPress={() => handleDeletePiece(p)} hitSlop={8}>
                      <Trash2 size={16} color={colors.candy.red} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </CandyCard>
          ))}
        </View>
      )}

      <SectionTitle title={t('classement.titre')} emoji="🏆" />
      {classement.length === 0 ? (
        <CandyCard style={{ marginBottom: spacing.lg }}>
          <Text style={[styles.emptyInlineText, { color: colors.text.body }]}>{t('maison.aucunMembre')}</Text>
        </CandyCard>
      ) : (
        classement.map((m, idx) => (
          <CandyCard key={m.id} style={styles.leaderboardCard}>
            <View style={styles.membreRow}>
              <Text style={styles.rankText}>{MEDALS[idx] ?? `#${idx + 1}`}</Text>
              <Avatar name={m.nom} image={m.image} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.membreNom, { color: colors.text.dark }]}>
                  {m.nom}{m.id === user?.id ? ` ${t('maison.vous')}` : ''}
                </Text>
              </View>
              <Badge label={`${m.points ?? 0} ${t('maison.points')}`} variant={idx === 0 ? 'yellow' : 'purple'} />
            </View>
          </CandyCard>
        ))
      )}

      {anniversairesAffiches.length > 0 ? (
        <>
          <SectionTitle title={t('maison.anniversaires')} emoji="🎂" style={{ marginTop: spacing.xl }} />
          {anniversairesAffiches.map((a) => (
            <CandyCard key={a.id} style={styles.leaderboardCard}>
              <View style={styles.membreRow}>
                <Avatar name={a.nom} image={a.image} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.membreNom, { color: colors.text.dark }]}>{a.nom}</Text>
                  <Text style={[styles.membreEmail, { color: colors.text.body }]}>
                    {a.aujourdhui
                      ? t('maison.cestAujourdhui')
                      : `${t('accueil.dans')} ${a.jours_restants} ${a.jours_restants > 1 ? t('accueil.jours') : t('accueil.jour')} · ${a.age_a_venir} ${t('accueil.ans')}`}
                  </Text>
                </View>
              </View>
            </CandyCard>
          ))}
        </>
      ) : null}

      <SectionTitle
        title={t('maison.membres')}
        emoji="👨‍👩‍👧‍👦"
        style={{ marginTop: spacing.xl }}
        right={
          isChef ? (
            <Pressable onPress={() => router.push('/(app)/membres/ajouter')} style={[styles.addButton, { backgroundColor: colors.primary.main }]}>
              <UserPlus size={18} color={colors.candy.white} />
            </Pressable>
          ) : undefined
        }
      />

      {loadingMembres ? (
        <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary.main} />
      ) : (
        membres.map((m) => (
          <CandyCard key={m.id} style={styles.membreCard}>
            <View style={styles.membreRow}>
              <Avatar name={m.nom} image={m.image} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.membreNom, { color: colors.text.dark }]}>
                  {m.nom}{m.id === user?.id ? ` ${t('maison.vous')}` : ''}
                </Text>
                <Text style={[styles.membreEmail, { color: colors.text.body }]}>{m.email}</Text>
                <View style={styles.roleBadgesRow}>
                  {m.role === 'chef' ? <Badge label={t('common.chef')} variant="yellow" /> : null}
                  {m.role === 'co_chef' ? <Badge label={t('maison.coChef')} variant="purple" /> : null}
                  {m.role === 'chef_temporaire' ? <Badge label={t('maison.chefTemporaireLabel')} variant="yellow" /> : null}
                  {m.role === 'visiteur' ? <Badge label={t('maison.visiteurLabel')} variant="neutral" /> : null}
                  {m.est_enfant ? <Badge label={t('maison.enfant')} variant="blue" /> : null}
                  {m.lien_famille ? <Badge label={t(`maison.${lienFamilleKey(m.lien_famille)}`)} variant="neutral" /> : null}
                </View>
              </View>
              {isChef && m.role !== 'chef' ? (
                <Pressable onPress={() => handleRemoveMembre(m.id, m.nom)} hitSlop={8} style={styles.trashButton}>
                  <Trash2 size={18} color={colors.candy.red} />
                </Pressable>
              ) : null}
            </View>

            {isChef && m.role !== 'chef' ? (
              <View style={[styles.roleActionsRow, { borderTopColor: colors.border }]}>
                {roleBusyId === m.id ? (
                  <ActivityIndicator size="small" color={colors.primary.main} />
                ) : (
                  <>
                    <Pressable onPress={() => handleToggleCoChef(m)} hitSlop={8} style={styles.roleActionButton}>
                      <UserCog size={14} color={colors.secondary.main} />
                      <Text style={[styles.roleActionText, { color: colors.text.body }]}>
                        {m.role === 'co_chef' ? t('maison.retrograderMembre') : t('maison.promouvoirCoChef')}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => handleToggleEnfant(m)} hitSlop={8} style={styles.roleActionButton}>
                      <Baby size={14} color={colors.candy.blueDark} />
                      <Text style={[styles.roleActionText, { color: colors.text.body }]}>
                        {m.est_enfant ? t('maison.retirerEnfant') : t('maison.marquerEnfant')}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => handleTransfererChef(m)} hitSlop={8} style={styles.roleActionButton}>
                      <Crown size={14} color={colors.candy.yellowDark} />
                      <Text style={[styles.roleActionText, { color: colors.text.body }]}>{t('maison.transfererChef')}</Text>
                    </Pressable>
                    <Pressable onPress={() => openRoleAvance(m)} hitSlop={8} style={styles.roleActionButton}>
                      <Settings2 size={14} color={colors.text.muted} />
                      <Text style={[styles.roleActionText, { color: colors.text.body }]}>{t('maison.roleAvance')}</Text>
                    </Pressable>
                  </>
                )}
              </View>
            ) : null}
          </CandyCard>
        ))
      )}

      {!isChef ? (
        <CandyButton label={t('maison.quitterMaison')} onPress={handleQuitter} variant="ghost" style={{ marginTop: spacing.md }} />
      ) : null}

      <SectionTitle
        title={t('maison.monProfil')}
        emoji="🙂"
        style={{ marginTop: spacing['2xl'] }}
        right={
          !editingProfile ? (
            <Pressable onPress={openEditProfile} hitSlop={8} style={[styles.editButton, { backgroundColor: colors.primary.subtle }]}>
              <Pencil size={16} color={colors.primary.main} />
            </Pressable>
          ) : undefined
        }
      />
      <CandyCard style={styles.profileCard}>
        {!editingProfile ? (
          <View style={styles.membreRow}>
            <Pressable onPress={handlePickAvatar} disabled={uploadingAvatar}>
              <Avatar name={user?.nom} image={user?.image} size={52} />
              <View style={[styles.avatarBadge, { backgroundColor: colors.primary.main, borderColor: colors.card }]}>
                {uploadingAvatar ? <ActivityIndicator size="small" color={colors.candy.white} /> : <Camera size={12} color={colors.candy.white} />}
              </View>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[styles.membreNom, { color: colors.text.dark }]}>{user?.nom}</Text>
              <Text style={[styles.membreEmail, { color: colors.text.body }]}>{user?.email}</Text>
              {user?.telephone ? <Text style={[styles.membreEmail, { color: colors.text.body }]}>{user.telephone}</Text> : null}
              <View style={styles.birthdayRow}>
                <Cake size={14} color={colors.text.muted} />
                <Text style={[styles.membreEmail, { color: colors.text.body }]}>
                  {user?.date_naissance || t('maison.dateNaissanceNonRenseignee')}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <>
            <CandyInput label={t('auth.nom')} value={nom} onChangeText={setNom} />
            <CandyInput label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <CandyInput label={t('maison.telephoneLabel')} value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" />
            <CandyInput
              label={t('maison.dateNaissanceFormat')}
              placeholder="1990-05-20"
              value={dateNaissance}
              onChangeText={setDateNaissance}
              icon={<Cake size={18} color={colors.text.muted} />}
            />
            {profileError ? <Text style={[styles.error, { color: colors.candy.red }]}>{profileError}</Text> : null}
            <View style={styles.profileActionsRow}>
              <CandyButton label={t('common.annuler')} onPress={() => setEditingProfile(false)} variant="ghost" style={{ flex: 1 }} />
              <CandyButton label={t('common.enregistrer')} onPress={handleSaveProfile} loading={savingProfile} variant="pink" style={{ flex: 1 }} />
            </View>
          </>
        )}
      </CandyCard>

      <CandyButton
        label={t('common.deconnexion')}
        onPress={handleLogout}
        variant="danger"
        icon={<LogOut size={18} color={colors.candy.white} />}
        style={{ marginTop: spacing.lg }}
      />
    </ScrollView>

    {/* ANNEXE V4 — Modale Pièce (création/édition) */}
    <Modal visible={pieceModalVisible} animationType="slide" transparent onRequestClose={() => setPieceModalVisible(false)}>
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalCard, { backgroundColor: colors.background }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text.dark }]}>
                {editingPiece ? t('common.modifier') : t('pieces.ajouter')} 🚪
              </Text>
              <Pressable onPress={() => setPieceModalVisible(false)} hitSlop={10}>
                <X size={22} color={colors.text.dark} />
              </Pressable>
            </View>

            <CandyInput label={t('pieces.nom')} placeholder={t('pieces.nomPlaceholder')} value={pieceNom} onChangeText={setPieceNom} />

            <Text style={[styles.label, { color: colors.text.dark }]}>{t('pieces.type')}</Text>
            <View style={styles.chipsRow}>
              {TYPES_PIECE.map((tp) => {
                const active = pieceType === tp;
                return (
                  <Pressable
                    key={tp}
                    onPress={() => setPieceType(tp)}
                    style={[
                      styles.chip,
                      { backgroundColor: colors.card, borderColor: colors.border },
                      active && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.primary.main : colors.text.body }]}>
                      {t(`pieces.${tp === 'salle_de_bain' ? 'salleDeBain' : tp}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.text.dark, marginTop: spacing.md }]}>{t('pieces.affecterA')}</Text>
            <View style={styles.chipsRow}>
              <Pressable
                onPress={() => setPieceAffecteA(null)}
                style={[
                  styles.chip,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  pieceAffecteA === null && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                ]}
              >
                <Text style={[styles.chipText, { color: pieceAffecteA === null ? colors.primary.main : colors.text.body }]}>
                  {t('pieces.personne')}
                </Text>
              </Pressable>
              {membres.map((m) => {
                const active = pieceAffecteA === m.id;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setPieceAffecteA(m.id)}
                    style={[
                      styles.chip,
                      { backgroundColor: colors.card, borderColor: colors.border },
                      active && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.primary.main : colors.text.body }]}>{m.nom}</Text>
                  </Pressable>
                );
              })}
            </View>

            {pieceError ? <Text style={[styles.error, { color: colors.candy.red }]}>{pieceError}</Text> : null}

            <CandyButton label={t('common.enregistrer')} onPress={handleSavePiece} loading={savingPiece} variant="pink" style={{ marginTop: spacing.md }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>

    {/* ANNEXE V4 — Modale Rôle avancé */}
    <Modal visible={!!roleModalMembre} animationType="slide" transparent onRequestClose={() => setRoleModalMembre(null)}>
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.modalCard, { backgroundColor: colors.background }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text.dark }]}>
                {t('maison.gererRole')} — {roleModalMembre?.nom}
              </Text>
              <Pressable onPress={() => setRoleModalMembre(null)} hitSlop={10}>
                <X size={22} color={colors.text.dark} />
              </Pressable>
            </View>

            <Text style={[styles.label, { color: colors.text.dark }]}>{t('maison.roles')}</Text>
            <Segmented
              value={roleModalRole}
              onChange={(v) => setRoleModalRole(v as any)}
              options={[
                { value: 'membre', label: t('maison.roleMembre') },
                { value: 'co_chef', label: t('maison.roleCoChef') },
                { value: 'chef_temporaire', label: t('maison.roleChefTemporaire') },
                { value: 'visiteur', label: t('maison.roleVisiteur') },
              ]}
            />

            <Text style={[styles.label, { color: colors.text.dark, marginTop: spacing.lg }]}>{t('maison.lienFamilleLabel')}</Text>
            <View style={styles.chipsRow}>
              <Pressable
                onPress={() => setRoleModalLien(null)}
                style={[
                  styles.chip,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  roleModalLien === null && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                ]}
              >
                <Text style={[styles.chipText, { color: roleModalLien === null ? colors.primary.main : colors.text.body }]}>
                  {t('maison.lienFamilleAucun')}
                </Text>
              </Pressable>
              {LIENS_FAMILLE.map((lien) => {
                const active = roleModalLien === lien;
                return (
                  <Pressable
                    key={lien}
                    onPress={() => setRoleModalLien(lien)}
                    style={[
                      styles.chip,
                      { backgroundColor: colors.card, borderColor: colors.border },
                      active && { borderColor: colors.primary.main, backgroundColor: colors.primary.subtle },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.primary.main : colors.text.body }]}>
                      {t(`maison.${lienFamilleKey(lien)}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {roleModalRole === 'chef_temporaire' || roleModalRole === 'visiteur' ? (
              <CandyInput
                label={t('maison.expireLe')}
                placeholder="2026-12-31"
                value={roleModalExpireLe}
                onChangeText={setRoleModalExpireLe}
              />
            ) : null}

            {roleModalError ? <Text style={[styles.error, { color: colors.candy.red }]}>{roleModalError}</Text> : null}

            <CandyButton label={t('common.enregistrer')} onPress={handleSaveRoleAvance} loading={savingRoleAvance} variant="pink" style={{ marginTop: spacing.md }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, paddingTop: spacing['2xl'], paddingBottom: 140 },
  maisonCard: { marginBottom: spacing.xl },
  maisonHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  maisonEmoji: { fontSize: 40 },
  maisonNomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  maisonNom: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.black },
  maisonMeta: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  logementChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
  },
  logementChipIcon: { fontSize: 12 },
  logementChipText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  codeLabel: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  codeValue: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.black, letterSpacing: 2 },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.pill,
  },
  shareButtonText: { fontWeight: typography.fontWeight.extrabold, fontSize: typography.fontSize.xs },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  membreCard: { marginBottom: spacing.sm },
  leaderboardCard: { marginBottom: spacing.sm },
  rankText: { fontSize: 20, width: 28, textAlign: 'center' },
  membreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  membreNom: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  membreEmail: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  birthdayRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  trashButton: { padding: spacing.xs },
  profileCard: { marginBottom: spacing.md },
  profileActionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  emptyInlineText: { fontWeight: typography.fontWeight.medium, textAlign: 'center' },
  error: { fontWeight: typography.fontWeight.bold, textAlign: 'center', marginBottom: spacing.sm },
  roleBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  roleActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  roleActionButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  roleActionText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  avatarBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  // ANNEXE V4 — Logement / Pièces / rôles étendus (modales)
  logementRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logementIconText: { fontSize: 18 },
  logementText: { fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.extrabold },
  logementDetail: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, marginTop: spacing.xs },
  pieceActionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  label: { fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.pill, borderWidth: 1.5 },
  chipText: { fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  modalTitle: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.black },
});
