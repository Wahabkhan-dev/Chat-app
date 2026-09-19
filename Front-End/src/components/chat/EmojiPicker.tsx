"use client";

import React from 'react';
import Picker, { EmojiStyle, SuggestionMode, Theme } from 'emoji-picker-react';
import { useAppContext } from '@/context/AppContext';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

/**
 * Full emoji picker (search, categories, skin tones, recently used).
 * Emojis render with the app's Google "Noto Color Emoji" font — see .app-emoji-picker in globals.css.
 * Loaded lazily from MessageInput so it doesn't add to the initial bundle.
 */
const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect }) => {
  const { state } = useAppContext();
  const theme = state.theme === 'dark' ? Theme.DARK : state.theme === 'light' ? Theme.LIGHT : Theme.AUTO;

  return (
    <div className="app-emoji-picker">
      <Picker
        onEmojiClick={(data) => onSelect(data.emoji)}
        emojiStyle={EmojiStyle.NATIVE}
        theme={theme}
        suggestedEmojisMode={SuggestionMode.RECENT}
        lazyLoadEmojis
        autoFocusSearch={false}
        searchPlaceHolder="Search emoji"
        previewConfig={{ showPreview: false }}
        width="min(340px, calc(100vw - 32px))"
        height={380}
      />
    </div>
  );
};

export default EmojiPicker;
