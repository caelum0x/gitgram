import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    Image,
    ScrollView,
    Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../../constants/Colors';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { useReelEditorStore, VISUAL_EFFECTS } from '../../store/reelEditorStore';
import { reelService } from '../../services/reelService';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import ReelTrimEditor from '../../components/Reel/ReelTrimEditor';
import { logger } from '../../utils/logger';

// Effect overlay component to apply visual effects on preview
const EffectPreviewOverlay = ({ effectId }: { effectId: string }) => {
    const effect = VISUAL_EFFECTS.find((e) => e.id === effectId);
    if (!effect || effect.id === 'none') return null;

    const overlayStyle: any = {
        ...StyleSheet.absoluteFillObject,
    };

    if (effect.adjustments?.saturation === 0) {
        overlayStyle.backgroundColor = 'rgba(128, 128, 128, 0.4)';
    } else if (effect.overlay) {
        overlayStyle.backgroundColor = effect.overlay.color;
    }

    return <View style={overlayStyle} pointerEvents="none" />;
};

export default function CreateReelScreen() {
    const router = useRouter();
    const { remixId, remixType } = useLocalSearchParams<{
        remixId?: string;
        remixType?: string;
    }>();
    const [caption, setCaption] = useState('');
    const [loading, setLoading] = useState(false);
    const [showTrimEditor, setShowTrimEditor] = useState(false);
    const videoRef = React.useRef<Video>(null);

    // Use the reel editor store
    const {
        videoUri,
        selectedEffect,
        musicTrack,
        startTime,
        endTime,
        duration,
        setVideoUri,
        setThumbnailUri,
        setDuration,
        setTrimSettings,
        reset,
    } = useReelEditorStore();

    // Get effect data for display
    const selectedEffectData = VISUAL_EFFECTS.find((e) => e.id === selectedEffect);
    const hasTrim = duration > 0 && (startTime > 0 || (endTime > 0 && endTime < duration));
    const trimDurationLabel = hasTrim ? `${Math.max(0.1, endTime - startTime).toFixed(1)}s` : null;

    const applySelectedVideo = (asset: ImagePicker.ImagePickerAsset) => {
        setVideoUri(asset.uri);
        if (typeof asset.duration === 'number' && asset.duration > 0) {
            setDuration(asset.duration / 1000);
        } else {
            setDuration(0);
        }
        const thumbnail = (asset as ImagePicker.ImagePickerAsset & { thumbnail?: string }).thumbnail;
        if (thumbnail) {
            setThumbnailUri(thumbnail);
        }
    };

    const pickVideo = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please grant camera roll permissions');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Videos,
            allowsEditing: true,
            quality: 1,
            videoMaxDuration: 60,
        });

        if (!result.canceled && result.assets[0]) {
            applySelectedVideo(result.assets[0]);
        }
    };

    const recordVideo = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please grant camera permissions');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Videos,
            allowsEditing: true,
            quality: 1,
            videoMaxDuration: 60,
        });

        if (!result.canceled && result.assets[0]) {
            applySelectedVideo(result.assets[0]);
        }
    };

    const navigateToEffects = () => {
        if (!videoUri) {
            Alert.alert('Select Video', 'Please select a video first before adding effects');
            return;
        }
        router.push('/reel/new/effects');
    };

    const handlePost = async () => {
        if (!videoUri) {
            Alert.alert('Error', 'Please select a video');
            return;
        }

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('video', {
                uri: videoUri,
                type: 'video/mp4',
                name: 'reel.mp4',
            } as any);
            formData.append('caption', caption);
            if (musicTrack?.id) {
                formData.append('musicTrackId', musicTrack.id);
            }
            if (duration > 0) {
                formData.append('duration', String(duration));
            }
            if (startTime > 0 || (duration > 0 && endTime > 0 && endTime < duration)) {
                formData.append('trimStart', String(startTime));
                formData.append('trimEnd', String(endTime));
            }

            // Include the selected effect
            if (selectedEffect && selectedEffect !== 'none') {
                formData.append('effect', selectedEffect);
            }

            // Preserve remix attribution when this reel was started from another reel.
            if (remixId) {
                formData.append('remixOfId', remixId);
                if (remixType) {
                    formData.append('remixType', remixType);
                }
            }

            await reelService.createReel(formData);

            // Reset the store after successful creation
            reset();

            Alert.alert('Success', 'Reel created successfully', [
                {
                    text: 'OK',
                    onPress: () => router.back(),
                },
            ]);
        } catch (error: any) {
            logger.error('Create reel error:', error);
            Alert.alert('Error', error.response?.data?.error || 'Failed to create reel');
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveVideo = () => {
        setVideoUri(null);
        setThumbnailUri(null);
        setDuration(0);
        setShowTrimEditor(false);
    };

    const previewTrimmedClip = () => {
        const previewStartMs = Math.max(0, startTime * 1000);
        void (async () => {
            await videoRef.current?.setPositionAsync(previewStartMs).catch(() => {});
            await videoRef.current?.playAsync().catch(() => {});
        })();
    };

    React.useEffect(() => {
        if (!videoUri || !hasTrim) {
            return;
        }

        void videoRef.current?.setPositionAsync(startTime * 1000).catch(() => {});
    }, [videoUri, hasTrim, startTime]);

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>New Reel</Text>
                </View>
                <LoadingSpinner fullScreen />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>New Reel</Text>
                <TouchableOpacity onPress={handlePost} disabled={!videoUri}>
                    <Text style={[styles.postText, !videoUri && styles.disabledText]}>
                        Share
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content}>
                {remixId ? (
                    <View style={styles.remixBanner}>
                        <Icon name="auto-awesome" size={16} color={Colors.accent} />
                        <Text style={styles.remixBannerText}>
                            Remixing an existing reel{remixType ? ` (${remixType})` : ''}
                        </Text>
                    </View>
                ) : null}
                {videoUri ? (
                    <View style={styles.previewContainer}>
                        <Video
                            ref={videoRef}
                            source={{ uri: videoUri }}
                            style={styles.videoPreview}
                            resizeMode={ResizeMode.COVER}
                            shouldPlay
                            isLooping={!hasTrim}
                            isMuted
                            onPlaybackStatusUpdate={(status) => {
                                if (!status.isLoaded || !hasTrim) {
                                    return;
                                }

                                const trimEndMs = endTime * 1000;
                                if (status.positionMillis >= trimEndMs - 120) {
                                    void (async () => {
                                        await videoRef.current?.setPositionAsync(startTime * 1000).catch(() => {});
                                        await videoRef.current?.playAsync().catch(() => {});
                                    })();
                                }
                            }}
                        />
                        <EffectPreviewOverlay effectId={selectedEffect} />
                        <TouchableOpacity style={styles.removeButton} onPress={handleRemoveVideo}>
                            <Icon name="close" size={24} color="#FFF" />
                        </TouchableOpacity>

                        {/* Effect Badge */}
                        {selectedEffect !== 'none' && selectedEffectData && (
                            <View style={styles.effectBadge}>
                                <Icon name={selectedEffectData.icon} size={14} color={Colors.text} />
                                <Text style={styles.effectBadgeText}>{selectedEffectData.label}</Text>
                            </View>
                        )}

                        {hasTrim && (
                            <View style={styles.trimBadge}>
                                <Icon name="content-cut" size={14} color={Colors.text} />
                                <Text style={styles.effectBadgeText}>{trimDurationLabel}</Text>
                            </View>
                        )}
                    </View>
                ) : (
                    <View style={styles.uploadButton}>
                        <Icon name="videocam" size={64} color={Colors.textSecondary} />
                        <Text style={styles.uploadText}>Create Reel Video</Text>
                        <View style={styles.uploadActions}>
                            <TouchableOpacity style={styles.uploadActionButton} onPress={recordVideo}>
                                <Text style={styles.uploadActionPrimaryText}>Record Video</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.uploadActionSecondaryButton} onPress={pickVideo}>
                                <Text style={styles.uploadActionSecondaryText}>Choose From Library</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Editing Tools */}
                {videoUri && (
                    <>
                    <View style={styles.toolsContainer}>
                        <TouchableOpacity style={styles.toolButton} onPress={navigateToEffects}>
                            <View style={[styles.toolIconBg, selectedEffect !== 'none' && styles.toolIconBgActive]}>
                                <Icon
                                    name={selectedEffectData?.icon || 'auto-fix-high'}
                                    size={22}
                                    color={selectedEffect !== 'none' ? Colors.accent : Colors.text}
                                />
                            </View>
                            <Text style={[styles.toolLabel, selectedEffect !== 'none' && styles.toolLabelActive]}>
                                Effects
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.toolButton} onPress={() => router.push('/reel/new/music')}>
                            <View style={styles.toolIconBg}>
                                <Icon name="music-note" size={22} color={musicTrack ? Colors.accent : Colors.text} />
                            </View>
                            <Text style={[styles.toolLabel, musicTrack && styles.toolLabelActive]}>Music</Text>
                            {musicTrack && (
                                <Text style={styles.toolValue} numberOfLines={1}>
                                    {musicTrack.title}
                                </Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.toolButton} onPress={() => setShowTrimEditor((current) => !current)}>
                            <View style={[styles.toolIconBg, (showTrimEditor || hasTrim) && styles.toolIconBgActive]}>
                                <Icon name="content-cut" size={22} color={(showTrimEditor || hasTrim) ? Colors.accent : Colors.text} />
                            </View>
                            <Text style={[styles.toolLabel, (showTrimEditor || hasTrim) && styles.toolLabelActive]}>Trim</Text>
                            {trimDurationLabel && (
                                <Text style={styles.toolValue}>{trimDurationLabel}</Text>
                            )}
                        </TouchableOpacity>

                    </View>
                    {showTrimEditor && (
                        <View style={styles.trimEditorContainer}>
                            <ReelTrimEditor
                                duration={duration}
                                startTime={startTime}
                                endTime={endTime > 0 ? endTime : duration}
                                onChange={setTrimSettings}
                                onPreview={previewTrimmedClip}
                            />
                        </View>
                    )}
                    </>
                )}

                <View style={styles.inputContainer}>
                    <Image
                        source={{ uri: 'https://github.com/github.png' }}
                        style={styles.avatar}
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Write a caption..."
                        placeholderTextColor={Colors.textSecondary}
                        multiline
                        value={caption}
                        onChangeText={setCaption}
                    />
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        paddingTop: 60,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        backgroundColor: Colors.secondary,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: Colors.text,
    },
    cancelText: {
        color: Colors.text,
        fontSize: 16,
    },
    postText: {
        color: Colors.primary,
        fontSize: 16,
        fontWeight: 'bold',
    },
    disabledText: {
        opacity: 0.5,
    },
    content: {
        flex: 1,
    },
    previewContainer: {
        height: 400,
        width: '100%',
        backgroundColor: '#000',
        position: 'relative',
    },
    videoPreview: {
        flex: 1,
    },
    removeButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 20,
        padding: 8,
    },
    effectBadge: {
        position: 'absolute',
        bottom: 16,
        left: 16,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        gap: 4,
    },
    effectBadgeText: {
        color: Colors.text,
        fontSize: 12,
        fontWeight: '600',
    },
    uploadButton: {
        height: 400,
        width: '100%',
        backgroundColor: Colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    uploadText: {
        color: Colors.textSecondary,
        fontSize: 18,
        fontWeight: '600',
    },
    uploadActions: {
        width: '100%',
        gap: 12,
        paddingHorizontal: 24,
    },
    uploadActionButton: {
        backgroundColor: Colors.accent,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
    },
    uploadActionPrimaryText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    uploadActionSecondaryButton: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: Colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
    },
    uploadActionSecondaryText: {
        color: Colors.text,
        fontSize: 15,
        fontWeight: '600',
    },
    toolsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 16,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        backgroundColor: Colors.surface,
    },
    toolButton: {
        alignItems: 'center',
        gap: 6,
    },
    toolIconBg: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: Colors.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    toolIconBgActive: {
        backgroundColor: 'rgba(47, 129, 247, 0.15)',
    },
    toolLabel: {
        fontSize: 12,
        color: Colors.text,
        fontWeight: '500',
    },
    toolLabelActive: {
        color: Colors.accent,
    },
    toolValue: {
        fontSize: 11,
        color: Colors.accent,
        maxWidth: 70,
    },
    trimEditorContainer: {
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 16,
        gap: 12,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    input: {
        flex: 1,
        color: Colors.text,
        fontSize: 16,
        minHeight: 100,
        textAlignVertical: 'top',
    },
    remixBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: Colors.surface,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    remixBannerText: {
        color: Colors.accent,
        fontSize: 13,
        fontWeight: '600',
    },
    trimBadge: {
        position: 'absolute',
        bottom: 16,
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14,
        gap: 4,
    },
});
