import { Tabs } from 'expo-router';
import React from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { HapticTab } from '@/components/haptic-tab';
import { Brand } from '@/constants/brand';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Brand.navy,
        tabBarInactiveTintColor: Brand.muted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: Brand.card,
          borderTopColor: Brand.border,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <MaterialIcons size={26} name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          title: 'Live',
          tabBarIcon: ({ color }) => <MaterialIcons size={26} name="bolt" color={color} />,
        }}
      />
      <Tabs.Screen
        name="jackpot"
        options={{
          title: 'Jackpot',
          tabBarIcon: ({ color }) => <MaterialIcons size={26} name="emoji-events" color={color} />,
        }}
      />
      <Tabs.Screen
        name="betslip"
        options={{
          title: 'Bet Slip',
          tabBarIcon: ({ color }) => <MaterialIcons size={26} name="receipt" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color }) => <MaterialIcons size={26} name="person" color={color} />,
        }}
      />
    </Tabs>
  );
}
