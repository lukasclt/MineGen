import React from 'react';
import { PluginSettings, Platform, JavaVersion } from '../types';
import { MC_VERSIONS } from '../constants';
import { Settings, Box, Database, Coffee, Tag } from 'lucide-react';

interface ConfigSidebarProps {
  settings: PluginSettings;
  setSettings: React.Dispatch<React.SetStateAction<PluginSettings>>;
  isOpen: boolean;
  toggleSidebar: () => void;
}

const ConfigSidebar: React.FC<ConfigSidebarProps> = ({ settings, setSettings, isOpen, toggleSidebar }) => {
  const handleChange = (field: keyof PluginSettings, value: string) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className={`fixed inset-y-0 left-0 z-30 w-72 bg-mc-panel border-r border-gray-700 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 overflow-y-auto`}>
      <div className="p-4 border-b border-gray-700 flex items-center gap-2">
        <Settings className="w-5 h-5 text-mc-accent" />
        <h2 className="font-bold text-lg text-white">Project Settings</h2>
      </div>

      <div className="p-4 space-y-6">
        {/* Identity */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
            <Tag className="w-3 h-3" /> Identity
          </label>
          <div>
            <span className="text-xs text-gray-500 mb-1 block">Project Name</span>
            <input
              type="text"
              value={settings.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-xs text-gray-500 mb-1 block">Group ID</span>
              <input
                type="text"
                value={settings.groupId}
                onChange={(e) => handleChange('groupId', e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs focus:border-mc-accent focus:outline-none text-white"
              />
            </div>
            <div>
              <span className="text-xs text-gray-500 mb-1 block">Artifact ID</span>
              <input
                type="text"
                value={settings.artifactId}
                onChange={(e) => handleChange('artifactId', e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs focus:border-mc-accent focus:outline-none text-white"
              />
            </div>
          </div>
        </div>

        {/* Environment */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
            <Database className="w-3 h-3" /> Environment
          </label>
          
          <div>
            <span className="text-xs text-gray-500 mb-1 block">Platform</span>
            <select
              value={settings.platform}
              onChange={(e) => handleChange('platform', e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white"
            >
              {Object.values(Platform).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="text-xs text-gray-500 mb-1 block">MC Version</span>
            <select
              value={settings.mcVersion}
              onChange={(e) => handleChange('mcVersion', e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white"
            >
              {MC_VERSIONS.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="text-xs text-gray-500 mb-1 block">Java Version</span>
            <select
              value={settings.javaVersion}
              onChange={(e) => handleChange('javaVersion', e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white"
            >
              {Object.entries(JavaVersion).map(([key, val]) => (
                <option key={key} value={val}>Java {val}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-3">
           <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
            <Coffee className="w-3 h-3" /> Metadata
          </label>
          <div>
            <span className="text-xs text-gray-500 mb-1 block">Description</span>
            <textarea
              value={settings.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-sm focus:border-mc-accent focus:outline-none text-white resize-none"
            />
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-gray-700">
        <p className="text-xs text-gray-500 text-center">MineGen AI v1.0.0</p>
      </div>
    </div>
  );
};

export default ConfigSidebar;